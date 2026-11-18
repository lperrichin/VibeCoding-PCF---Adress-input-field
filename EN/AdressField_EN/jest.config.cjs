/** Unit tests for the pure logic (utils/ and services/). The PCF build does not touch tests/. */
module.exports = {
    testEnvironment: "node",
    roots: ["<rootDir>/tests"],
    testMatch: ["**/*.test.ts"],
    transform: {
        "^.+\\.tsx?$": [
            "ts-jest",
            {
                tsconfig: {
                    target: "es2020",
                    module: "commonjs",
                    moduleResolution: "node",
                    lib: ["ES2020", "DOM"],
                    strict: true,
                    jsx: "react",
                    esModuleInterop: true,
                    skipLibCheck: true,
                    types: ["jest", "node", "powerapps-component-framework"],
                },
            },
        ],
    },
};
