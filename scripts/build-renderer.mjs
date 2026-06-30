import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const projectRoot = process.cwd();
const entryFile = path.join(projectRoot, "src", "renderer", "app.ts");
const globalTypesFile = path.join(projectRoot, "src", "renderer", "global.d.ts");
const outputFile = path.join(projectRoot, "dist", "renderer", "app.js");

const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  strict: true,
  esModuleInterop: true,
  forceConsistentCasingInFileNames: true,
  skipLibCheck: true,
  types: ["node"]
};

const program = ts.createProgram([entryFile, globalTypesFile], compilerOptions);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  const host = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => projectRoot,
    getNewLine: () => "\n"
  };
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
  process.exit(1);
}

const moduleFiles = new Set();
collectModule(entryFile);

const sortedFiles = [...moduleFiles].sort();
const idByFile = new Map(sortedFiles.map((file) => [file, toModuleId(file)]));
const dependencyMap = {};

const modules = [];
for (const file of sortedFiles) {
  const source = await fs.readFile(file, "utf8");
  dependencyMap[idByFile.get(file)] = resolveDependencies(file, source);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      ...compilerOptions,
      sourceMap: false,
      inlineSources: false
    },
    fileName: file
  }).outputText.trimEnd();
  modules.push(`${JSON.stringify(idByFile.get(file))}: function(require, exports) {\n${indent(transpiled)}\n}`);
}

const bundle = `(() => {
  "use strict";
  const modules = {
${modules.map((item) => indent(item, 4)).join(",\n")}
  };
  const dependencies = ${JSON.stringify(dependencyMap, null, 2)};
  const cache = {};

  function requireModule(id) {
    if (cache[id]) return cache[id].exports;
    const factory = modules[id];
    if (!factory) throw new Error("Renderer module not found: " + id);
    const module = { exports: {} };
    cache[id] = module;
    const localRequire = (request) => requireModule(dependencies[id][request]);
    factory(localRequire, module.exports);
    return module.exports;
  }

  requireModule(${JSON.stringify(idByFile.get(entryFile))});
})();
`;

await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(outputFile, bundle, "utf8");

function collectModule(file) {
  const normalized = path.normalize(file);
  if (moduleFiles.has(normalized)) return;
  moduleFiles.add(normalized);

  const source = ts.sys.readFile(normalized);
  if (!source) throw new Error("Unable to read renderer module: " + normalized);

  const sourceFile = ts.createSourceFile(normalized, source, ts.ScriptTarget.ES2022, true);
  for (const specifier of getRelativeImports(sourceFile)) {
    collectModule(resolveImport(normalized, specifier));
  }
}

function resolveDependencies(file, source) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
  const dependencies = {};
  for (const specifier of getRelativeImports(sourceFile)) {
    dependencies[specifier] = toModuleId(resolveImport(file, specifier));
  }
  return dependencies;
}

function getRelativeImports(sourceFile) {
  const imports = [];
  sourceFile.forEachChild((node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (specifier.startsWith(".")) imports.push(specifier);
    }
  });
  return imports;
}

function resolveImport(fromFile, specifier) {
  const basePath = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [basePath + ".ts", path.join(basePath, "index.ts")]) {
    if (ts.sys.fileExists(candidate)) return path.normalize(candidate);
  }
  throw new Error(`Unable to resolve renderer import "${specifier}" from ${fromFile}`);
}

function toModuleId(file) {
  return path.relative(projectRoot, file).replace(/\\/g, "/");
}

function indent(value, spaces = 2) {
  const padding = " ".repeat(spaces);
  return value.split("\n").map((line) => padding + line).join("\n");
}
