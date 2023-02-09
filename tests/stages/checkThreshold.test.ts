import {
    checkThreshold,
    getCoveredDirectories,
    getNormalizedThreshold,
    getUncheckedFiles,
} from './../../src/stages/checkThreshold';
import { createDataCollector } from './../../src/utils/DataCollector';
import coverageReport from '../mock-data/jsonReport3.json';

describe('checkThreshold', () => {
    const threshold = {
        global: {
            statements: 77,
            branches: 69,
            functions: 65,
            lines: 77,
        },
        './src/': {
            statements: 77,
            branches: 69,
            functions: 65,
            lines: 77,
        },
        './src/stages/runTest.ts': {
            statements: 77,
            branches: 69,
            functions: 65,
            lines: 77,
        },
    };

    describe('getNormalizedThreshold()', () => {
        it('should return threshold without "global" field', () => {
            expect(getNormalizedThreshold(threshold)).not.toHaveProperty(
                'global'
            );
        });

        it('should remove triling slashes for threshold paths', () => {
            expect(getNormalizedThreshold(threshold)).toEqual({
                './src': {
                    statements: 77,
                    branches: 69,
                    functions: 65,
                    lines: 77,
                },
                './src/stages/runTest.ts': {
                    statements: 77,
                    branches: 69,
                    functions: 65,
                    lines: 77,
                },
            });
        });
    });

    describe('getCoveredDirectories()', () => {
        it('should return unique directories used in coverage report', () => {
            expect(
                getCoveredDirectories({
                    'src/stages/runTest.ts': {},
                    'src/format/details/getDecreasedCoverage.ts': {},
                } as any).filter((path) => path === 'src')
            ).toHaveLength(1);
        });

        it('should return directories used in coverage report', () => {
            expect(
                getCoveredDirectories({
                    'src/stages/runTest.ts': {},
                    'src/format/details/getDecreasedCoverage.ts': {},
                } as any)
            ).toEqual([
                'src/stages',
                'src',
                'src/format/details',
                'src/format',
            ]);
        });
    });

    describe('getUncheckedFiles()', () => {
        it('should return files not specified in coverage threshold', () => {
            expect(
                getUncheckedFiles(threshold, {
                    'src/stages/runTest.ts': {},
                    'src/format/details/getDecreasedCoverage.ts': {},
                } as any)
            ).toEqual([]);

            expect(
                getUncheckedFiles(threshold, {
                    'src/stages/runTest.ts': {},
                    'src/format/details/getDecreasedCoverage.ts': {},
                    'unspecified-folder/file.ts': {},
                    'another-folder/file.js': {},
                } as any)
            ).toEqual(['unspecified-folder/file.ts', 'another-folder/file.js']);

            expect(
                getUncheckedFiles(threshold, {
                    'lib/stages/runTest.ts': {},
                    'lib/format/details/getDecreasedCoverage.ts': {},
                    'lib/file-1.ts': {},
                    'lib/file-2.js': {},
                } as any)
            ).toEqual([
                'lib/stages/runTest.ts',
                'lib/format/details/getDecreasedCoverage.ts',
                'lib/file-1.ts',
                'lib/file-2.js',
            ]);
        });

        it('should return all files if threshold contains "global" field only', () => {
            expect(
                getUncheckedFiles(
                    {
                        global: {
                            statements: 77,
                            branches: 69,
                            functions: 65,
                            lines: 77,
                        },
                    },
                    {
                        'src/stages/runTest.ts': {},
                        'src/format/details/getDecreasedCoverage.ts': {},
                        'unspecified-folder/file.ts': {},
                        'another-folder/file.js': {},
                        'global/global.ts': {},
                    } as any
                )
            ).toEqual([
                'src/stages/runTest.ts',
                'src/format/details/getDecreasedCoverage.ts',
                'unspecified-folder/file.ts',
                'another-folder/file.js',
                'global/global.ts',
            ]);
        });
    });

    describe('checkThreshold()', () => {
        let cwdMock: jest.SpyInstance<string, []>;

        beforeAll(() => {
            cwdMock = jest.spyOn(process, 'cwd').mockReturnValue('');
        });

        afterAll(() => {
            cwdMock.mockRestore();
        });

        it('should return unmet threshold for "src" folder', () => {
            const dataCollector = createDataCollector();

            const results = checkThreshold(
                coverageReport as any,
                threshold,
                '',
                dataCollector
            );

            expect(results).toEqual([
                {
                    expected: 77,
                    received: 75.65674255691769,
                    type: 'statements',
                    path: 'src',
                },
            ]);
        });

        it('should return unmet threshold for "global"', () => {
            const dataCollector = createDataCollector();

            const results = checkThreshold(
                coverageReport as any,
                { global: threshold.global },
                '',
                dataCollector
            );

            expect(results).toEqual([
                {
                    expected: 77,
                    received: 75.65674255691769,
                    type: 'statements',
                    path: 'global',
                },
            ]);
        });

        it('should return unmet threshold for "global" and "src/format"', () => {
            const dataCollector = createDataCollector();

            const results = checkThreshold(
                coverageReport as any,
                {
                    global: threshold.global,
                    './src/format/': {
                        statements: 100,
                        branches: 100,
                        functions: 100,
                        lines: 100,
                    },
                },
                '',
                dataCollector
            );

            expect(results).toEqual([
                {
                    expected: 100,
                    received: 84.82142857142857,
                    type: 'statements',
                    path: 'src/format',
                },
                {
                    expected: 77,
                    received: 69.7406340057637,
                    type: 'statements',
                    path: 'global',
                },
            ]);
        });

        it('should return unmet branches threshold for "src/format/details/getNewFilesCoverage.ts"', () => {
            const dataCollector = createDataCollector();

            const results = checkThreshold(
                coverageReport as any,
                {
                    './src/format/details/getNewFilesCoverage.ts': {
                        branches: 100,
                        statements: 100,
                        functions: 100,
                        lines: 100,
                    },
                },
                '',
                dataCollector
            );

            expect(results).toEqual([
                {
                    expected: 100,
                    received: 0,
                    type: 'branches',
                    path: 'src/format/details/getNewFilesCoverage.ts',
                },
            ]);
        });

        it('should pass all thresholds', () => {
            const dataCollector = createDataCollector();

            const results = checkThreshold(
                coverageReport as any,
                {
                    global: {
                        statements: 50,
                        branches: 50,
                        functions: 50,
                        lines: 50,
                    },
                },
                '',
                dataCollector
            );

            expect(results).toEqual([]);
        });
    });
});
