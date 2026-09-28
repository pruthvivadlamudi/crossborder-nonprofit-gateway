/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  testTimeout: 15000,
  clearMocks: true,
  restoreMocks: true,
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        target: 'ES2022',
        module: 'CommonJS',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        types: ['node', 'jest']
      }
    }]
  }
};
