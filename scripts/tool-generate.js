#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..'));

const DEFAULT_GENERATED_DIR = join(ROOT_DIR, 'scripts', 'generated');
const DEFAULT_LOGS_DIR = join(ROOT_DIR, 'logs', 'tools');
const DEFAULT_TEMPLATE_PATH = join(ROOT_DIR, 'docs', 'templates', 'tool.md');

function parseArgs(argv) {
  const args = {
    name: '',
    template: '',
    outputDir: DEFAULT_GENERATED_DIR,
    logsDir: DEFAULT_LOGS_DIR,
    list: false,
    help: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--name' && argv[index + 1]) {
      args.name = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--template' && argv[index + 1]) {
      args.template = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--output-dir' && argv[index + 1]) {
      args.outputDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--logs-dir' && argv[index + 1]) {
      args.logsDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--list' || arg === '-l') {
      args.list = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
  }

  return args;
}

function toContractPath(path) {
  const repoRelative = relative(ROOT_DIR, path);
  return repoRelative && !repoRelative.startsWith('..') ? repoRelative : path;
}

function toValidIdentifier(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toClassName(name) {
  return name
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

async function readText(path) {
  try {
    return {
      exists: true,
      text: await readFile(path, 'utf-8'),
      read_error: '',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/\bENOENT\b/.test(message)) {
      return {
        exists: false,
        text: '',
        read_error: '',
      };
    }
    return {
      exists: false,
      text: '',
      read_error: message,
    };
  }
}

async function listGeneratedTools(outputDir) {
  try {
    const entries = await readdir(outputDir, { withFileTypes: true });
    const tools = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
      .map(entry => ({
        name: entry.name.replace(/\.js$/, ''),
        path: join(outputDir, entry.name),
      }));
    return tools;
  } catch {
    return [];
  }
}

function extractPatternFromTemplate(templateText) {
  const sections = {
    problem: '',
    detection: '',
    severity: '',
  };

  const problemMatch = templateText.match(/## Pattern Description[\s\S]*?(?=##|$)/);
  if (problemMatch) {
    sections.problem = problemMatch[0];
  }

  const behaviorMatch = templateText.match(/## Expected Behavior[\s\S]*?(?=##|$)/);
  if (behaviorMatch) {
    const behavior = behaviorMatch[0];
    const detectMatch = behavior.match(/### What the tool should detect[\s\S]*?(?=###|$)/);
    if (detectMatch) {
      sections.detection = detectMatch[0];
    }
  }

  return sections;
}

function generateToolScript(name, templatePath, outputDir, logsDir) {
  const identifier = toValidIdentifier(name);
  const className = toClassName(name);
  const reportName = `tool_${identifier}_report.v1`;
  const logSubdir = identifier;

  return `#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..', '..'));

const DEFAULT_REPORT_PATH = join(ROOT_DIR, '${toContractPath(logsDir)}', '${logSubdir}', 'report.json');

function parseArgs(argv) {
  const args = {
    paths: [],
    report: DEFAULT_REPORT_PATH,
    fix: false,
    json: false,
    verbose: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--path' && argv[index + 1]) {
      args.paths.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if ((arg === '--report' || arg === '-o') && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--fix') {
      args.fix = true;
      continue;
    }
    if (arg === '--json') {
      args.json = true;
      continue;
    }
    if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(\`
Usage: node \${basename(__filename)} [options]

Options:
  --path <path>       Add a file or directory to scan (can be used multiple times)
  --report, -o <path> Output report path (default: \${DEFAULT_REPORT_PATH})
  --fix               Apply fixes (default: read-only mode)
  --json              Output report as JSON to stdout
  --verbose, -v       Enable verbose logging
  --help, -h          Show this help message

Examples:
  node \${basename(__filename)} --path ./src --path ./tests
  node \${basename(__filename)} --path ./src --fix
\`);
      process.exit(0);
    }
  }

  return args;
}

function toContractPath(path) {
  const repoRelative = relative(ROOT_DIR, path);
  return repoRelative && !repoRelative.startsWith('..') ? repoRelative : path;
}

async function readText(path) {
  try {
    return {
      exists: true,
      text: await readFile(path, 'utf-8'),
      read_error: '',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/\\bENOENT\\b/.test(message)) {
      return {
        exists: false,
        text: '',
        read_error: '',
      };
    }
    return {
      exists: false,
      text: '',
      read_error: message,
    };
  }
}

async function collectFiles(paths) {
  const files = [];
  
  async function walk(currentPath) {
    try {
      const stat = await readFile(currentPath).then(() => true).catch(() => false);
      if (!stat) return;
      
      const entry = await readFile(currentPath, 'utf-8').then(() => ({ isFile: () => true, isDirectory: () => false })).catch(async () => {
        try {
          const entries = await readdir(currentPath, { withFileTypes: true });
          return { isFile: () => false, isDirectory: () => true, entries };
        } catch {
          return { isFile: () => false, isDirectory: () => false };
        }
      });
      
      if (entry.isFile()) {
        files.push(currentPath);
      } else if (entry.isDirectory && entry.entries) {
        for (const child of entry.entries) {
          await walk(join(currentPath, child.name));
        }
      }
    } catch {
      // Skip unreadable paths
    }
  }
  
  for (const path of paths) {
    await walk(resolve(path));
  }
  
  return [...new Set(files)].sort();
}

function buildCheck({ id, name, status, summary, evidence, details }) {
  return {
    id,
    level: 'tool-${identifier}',
    name,
    status,
    summary,
    evidence,
    details,
  };
}

async function evaluateChecks({ files, fix }) {
  const checks = [];
  const violations = [];
  
  // TODO: Implement pattern detection logic
  // This is a placeholder - replace with actual implementation
  
  checks.push(
    buildCheck({
      id: '${identifier.toUpperCase()}-001',
      name: 'Placeholder check - implement pattern detection',
      status: 'pass',
      summary: 'Tool template generated successfully. Implement pattern detection logic.',
      evidence: files.slice(0, 5).map(f => toContractPath(f)),
      details: {
        files_scanned: files.length,
        fix_mode: fix,
      },
    })
  );
  
  return { checks, violations };
}

function buildReport({ checks, reportPath, paths, violations }) {
  const failedCheckIds = checks.filter(check => check.status !== 'pass').map(check => check.id);
  
  return {
    schema_version: '${reportName}',
    generated_at: new Date().toISOString(),
    report_path: toContractPath(reportPath),
    tool: {
      name: '${identifier}',
      version: '1.0.0',
      template_source: '${toContractPath(templatePath)}',
    },
    summary: {
      overall_status: failedCheckIds.length === 0 ? 'pass' : 'fail',
      failed_check_ids: failedCheckIds,
      files_scanned: paths.length,
      violations_found: violations.length,
    },
    checks,
    violations,
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const reportPath = resolve(args.report);
    
    if (args.paths.length === 0) {
      console.error('Error: At least one --path is required');
      process.exit(1);
    }
    
    if (args.verbose) {
      console.log('Scanning paths:', args.paths);
    }
    
    const files = await collectFiles(args.paths);
    
    if (args.verbose) {
      console.log(\`Found \${files.length} files to scan\`);
    }
    
    const { checks, violations } = await evaluateChecks({ files, fix: args.fix });
    
    const report = buildReport({
      checks,
      reportPath,
      paths: args.paths,
      violations,
    });
    
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, \`\${JSON.stringify(report, null, 2)}\\n\`, 'utf-8');
    console.log(\`Report written to \${reportPath}\`);
    
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    }
    
    // AGT-003: Read-only by default
    if (!args.fix && violations.length > 0) {
      console.log(\`\\nFound \${violations.length} violation(s). Run with --fix to apply corrections.\`);
    }
    
    process.exit(report.summary.overall_status === 'pass' ? 0 : 1);
  } catch (error) {
    console.error('Tool execution failed:', error);
    process.exit(1);
  }
}

main();
`;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(`
Usage: node tool-generate.js [options]

Generate a new tool script from a template.

Options:
  --name <name>       Tool name (required for generation)
  --template <path>   Path to tool template file (default: docs/templates/tool.md)
  --output-dir <dir>  Directory for generated scripts (default: scripts/generated/)
  --logs-dir <dir>    Directory for tool logs (default: logs/tools/)
  --list, -l          List all generated tools
  --help, -h          Show this help message

Examples:
  node tool-generate.js --name date-linter --template ./my-template.md
  node tool-generate.js --list
`);
    process.exit(0);
  }

  if (args.list) {
    const tools = await listGeneratedTools(args.outputDir);
    if (tools.length === 0) {
      console.log('No generated tools found in', toContractPath(args.outputDir));
    } else {
      console.log('Generated tools:');
      for (const tool of tools) {
        console.log(`  - ${tool.name}`);
        console.log(`    ${toContractPath(tool.path)}`);
      }
    }
    process.exit(0);
  }

  if (!args.name) {
    console.error('Error: --name is required');
    process.exit(1);
  }

  // Read template if provided
  let templateContent = '';
  if (args.template) {
    const template = await readText(args.template);
    if (!template.exists) {
      console.error(`Error: Template not found: ${args.template}`);
      process.exit(1);
    }
    templateContent = template.text;
  } else {
    // Use default template
    const template = await readText(DEFAULT_TEMPLATE_PATH);
    if (template.exists) {
      templateContent = template.text;
    }
  }

  // Generate tool script
  const identifier = toValidIdentifier(args.name);
  const outputPath = join(args.outputDir, `${identifier}.js`);
  const scriptContent = generateToolScript(
    args.name,
    args.template || DEFAULT_TEMPLATE_PATH,
    args.outputDir,
    args.logsDir
  );

  // Ensure output directory exists
  await mkdir(args.outputDir, { recursive: true });

  // Write generated script
  await writeFile(outputPath, scriptContent, 'utf-8');

  console.log(`Generated tool: ${identifier}`);
  console.log(`  Script: ${toContractPath(outputPath)}`);
  console.log(`  Logs: ${toContractPath(args.logsDir)}/${identifier}/`);
  console.log(`\nNext steps:`);
  console.log(`  1. Review and customize the generated script`);
  console.log(`  2. Implement the pattern detection logic`);
  console.log(`  3. Add npm script: "tool:${identifier}": "node ./scripts/generated/${identifier}.js --path ./src"`);
  console.log(`  4. Test: node ${toContractPath(outputPath)} --path ./src --verbose`);
}

main().catch(error => {
  console.error('Tool generation failed:', error);
  process.exit(1);
});
