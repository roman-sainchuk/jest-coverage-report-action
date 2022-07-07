import { dirname, sep } from 'path';

import isNil from 'lodash/isNil';
import micromatch from 'micromatch';

import { JestThreshold, SingleThreshold } from '../typings/JestThreshold';
import { JsonReport } from '../typings/JsonReport';
import { FailReason } from '../typings/Report';
import { ThresholdResult } from '../typings/ThresholdResult';
import { accumulateCoverageDetails } from '../utils/accumulateCoverageDetails';
import { checkSingleThreshold } from '../utils/checkSingleThreshold';
import { DataCollector } from '../utils/DataCollector';
import { getCoverageForDirectory } from '../utils/getCoverageForDirectory';
import { getFileCoverageMap } from '../utils/getFileCoverageMap';
import { DetailedFileCoverage } from '../utils/getFileCoverageMap';
import { joinPaths } from '../utils/joinPaths';

export const getNormalizedThreshold = (
    threshold: JestThreshold
): JestThreshold => {
    const trailingSlashReg = new RegExp(`${sep}$`);
    const thresholdEntries = Object.entries(threshold).filter(
        ([path]) => path !== 'global'
    );

    return Object.fromEntries(
        thresholdEntries.map(([path, threshold]): [string, SingleThreshold] => [
            path.replace(trailingSlashReg, ''),
            threshold,
        ])
    );
};

export const getCoveredDirectories = (
    coverageDetailMap: Record<string, DetailedFileCoverage>
): string[] => {
    const coveragePaths = Object.keys(coverageDetailMap);
    const dirSet = new Set<string>();

    coveragePaths.forEach((path) => {
        let directory = dirname(path);

        while (directory !== '.') {
            dirSet.add(directory);
            directory = dirname(directory);
        }
    });

    return Array.from(dirSet);
};

export const getUncheckedFiles = (
    threshold: JestThreshold,
    coverageDetailMap: Record<string, DetailedFileCoverage>
) => {
    const normalizedThresholds = getNormalizedThreshold(threshold);
    const normalizedThresholdPaths = Object.entries(normalizedThresholds).map(
        ([path]) => path
    );

    const files = Object.keys(coverageDetailMap);

    if (normalizedThresholdPaths.length) {
        const directories = getCoveredDirectories(coverageDetailMap);

        return micromatch.not(
            files,
            normalizedThresholdPaths
                .concat(micromatch(directories, normalizedThresholdPaths))
                .map((path) => `${path}/**`)
        );
    }

    return files;
};

export const checkThreshold = (
    report: JsonReport,
    threshold: JestThreshold,
    workingDirectory: string | undefined,
    dataCollector: DataCollector<unknown>
) => {
    const cwd = joinPaths(process.cwd(), workingDirectory);
    // Maybe somehow take this from "format" stage?
    const coverageDetailMap = Object.fromEntries(
        Object.entries(getFileCoverageMap(report)).map(([key, value]) => [
            key.replace(`${cwd}/`, ''),
            value,
        ])
    );

    const totalResults: ThresholdResult[] = [];
    const normalizedThresholds = getNormalizedThreshold(threshold);
    const normalizedThresholdEntries = Object.entries(normalizedThresholds);

    const directories = getCoveredDirectories(coverageDetailMap);
    normalizedThresholdEntries.forEach(([pattern, threshold]) => {
        const selectedDirectories = micromatch(directories, pattern);

        const coverageOfDirectories = selectedDirectories.map((directory) =>
            getCoverageForDirectory(directory, coverageDetailMap)
        );

        const thresholdResults = coverageOfDirectories.map((coverage, index) =>
            checkSingleThreshold(
                threshold,
                coverage,
                selectedDirectories[index]
            )
        );

        totalResults.push(
            ...(thresholdResults.filter(
                (value) => value !== undefined
            ) as ThresholdResult[])
        );
    });

    const files = Object.keys(coverageDetailMap);
    normalizedThresholdEntries.forEach(([pattern, threshold]) => {
        const selectedFiles = micromatch(files, pattern);

        const thresholdResults = selectedFiles.map((filename) =>
            checkSingleThreshold(
                threshold,
                coverageDetailMap[filename],
                filename
            )
        );

        totalResults.push(
            ...(thresholdResults.filter(
                (value) => value !== undefined
            ) as ThresholdResult[])
        );
    });

    if (!isNil(threshold.global)) {
        const uncheckedFiles = getUncheckedFiles(
            normalizedThresholds,
            coverageDetailMap
        );

        const uncheckedTotal = accumulateCoverageDetails(
            uncheckedFiles.map((filename) => coverageDetailMap[filename])
        );

        const globalResult = checkSingleThreshold(
            threshold.global,
            uncheckedTotal,
            'global'
        );

        if (globalResult) {
            totalResults.push(globalResult);
        }
    }

    if (totalResults.length > 0) {
        dataCollector.add(FailReason.UNDER_THRESHOLD);
    }

    return totalResults;
};
