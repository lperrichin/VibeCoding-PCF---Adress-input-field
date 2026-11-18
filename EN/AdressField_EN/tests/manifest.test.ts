/**
 * Dataverse validates the manifest against a stricter XSD than the local build:
 * attribute values must not contain apostrophes (found at the first import, Step 11).
 */
import * as fs from "fs";
import * as path from "path";

const xml = fs.readFileSync(path.join(__dirname, "../AdressFieldEN/ControlManifest.Input.xml"), "utf-8");

describe("ControlManifest.Input.xml", () => {
    test("no apostrophe inside any attribute value (Dataverse noAposStringType)", () => {
        const bad = Array.from(xml.matchAll(/\b([\w-]+)="([^"]*)"/g)).filter((m) => m[2].includes("'")).map((m) => `${m[1]}="${m[2]}"`);
        expect(bad).toEqual([]);
    });

    test("canvas / React settings", () => {
        expect(xml).toContain('control-type="virtual"');
        expect(xml).toContain("<domain>photon.komoot.io</domain>");
        expect(xml).toContain('<platform-library name="React"');
        expect(xml).toContain('<platform-library name="Fluent"');
    });

    test("18 properties: 9 bound, 9 input", () => {
        expect((xml.match(/usage="bound"/g) ?? []).length).toBe(9);
        expect((xml.match(/usage="input"/g) ?? []).length).toBe(9);
    });
});
