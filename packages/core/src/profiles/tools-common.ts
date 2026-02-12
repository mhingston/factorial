import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ExecutionEnvironment, ToolDefinition } from './types.js';

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a file. Returns the file content as a string or an error message if the file cannot be read.',
  parameters: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Absolute path to the file to read'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to read (optional)',
        minimum: 1
      },
      offset: {
        type: 'number',
        description: 'Line number to start reading from (0-indexed, optional)',
        minimum: 0
      }
    },
    required: ['file_path']
  },
  execute: async (args: unknown, env: ExecutionEnvironment) => {
    const { file_path, limit, offset } = args as { file_path: string; limit?: number; offset?: number };
    const resolvedPath = resolve(env.workDir, file_path);
    
    try {
      let content = await readFile(resolvedPath, 'utf-8');
      const lines = content.split('\n');
      
      if (offset !== undefined) {
        content = lines.slice(offset).join('\n');
      }
      if (limit !== undefined) {
        content = lines.slice(offset ?? 0, (offset ?? 0) + limit).join('\n');
      }
      
      return content;
    } catch (error) {
      return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
};

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: 'Create a new file or overwrite an existing file with new content.',
  parameters: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Absolute path to the file to write'
      },
      content: {
        type: 'string',
        description: 'Content to write to the file'
      }
    },
    required: ['file_path', 'content']
  },
  execute: async (args: unknown, env: ExecutionEnvironment) => {
    const { file_path, content } = args as { file_path: string; content: string };
    const resolvedPath = resolve(env.workDir, file_path);
    
    try {
      await writeFile(resolvedPath, content, 'utf-8');
      return `Successfully wrote ${content.length} bytes to ${file_path}`;
    } catch (error) {
      return `Error writing file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
};

export const shellTool: ToolDefinition = {
  name: 'shell',
  description: 'Execute a shell command in the working directory. Use with caution - prefer read-only commands.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to execute'
      },
      timeout_ms: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
        minimum: 1000,
        maximum: 300000
      }
    },
    required: ['command']
  },
  execute: async (args: unknown, env: ExecutionEnvironment) => {
    const { command, timeout_ms = 30000 } = args as { command: string; timeout_ms?: number };
    
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      
      const { stdout, stderr } = await execAsync(command, {
        cwd: env.workDir,
        timeout: timeout_ms,
        signal: env.signal
      });
      
      const output = stdout || '';
      const errorOutput = stderr || '';
      
      if (errorOutput) {
        return `${output}\n[stderr]: ${errorOutput}`.trim();
      }
      return output;
    } catch (error) {
      return `Error executing command: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
};

export const grepTool: ToolDefinition = {
  name: 'grep',
  description: 'Search for a pattern in files using regular expressions. Returns matching lines with file paths.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for'
      },
      path: {
        type: 'string',
        description: 'Directory or file path to search in (default: working directory)'
      },
      include: {
        type: 'string',
        description: 'File pattern to include (e.g., "*.ts", optional)'
      }
    },
    required: ['pattern']
  },
  execute: async (args: unknown, env: ExecutionEnvironment) => {
    const { pattern, path, include } = args as { 
      pattern: string; 
      path?: string; 
      include?: string;
    };
    const searchPath = path ? resolve(env.workDir, path) : env.workDir;
    
    try {
      const results: string[] = [];
      const regex = new RegExp(pattern, 'g');
      
      async function searchDir(dir: string): Promise<void> {
        const entries = await readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
              await searchDir(fullPath);
            }
          } else if (entry.isFile()) {
            if (include && !entry.name.match(include.replace('*', '.*').replace('.', '\\.'))) {
              continue;
            }
            
            try {
              const content = await readFile(fullPath, 'utf-8');
              const lines = content.split('\n');
              
              lines.forEach((line, index) => {
                if (regex.test(line)) {
                  results.push(`${fullPath}:${index + 1}: ${line.trim()}`);
                }
                regex.lastIndex = 0; // Reset regex
              });
            } catch {
              // Skip files that cannot be read
            }
          }
        }
      }
      
      const stats = await stat(searchPath);
      if (stats.isDirectory()) {
        await searchDir(searchPath);
      } else {
        const content = await readFile(searchPath, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (regex.test(line)) {
            results.push(`${searchPath}:${index + 1}: ${line.trim()}`);
          }
          regex.lastIndex = 0;
        });
      }
      
      return results.length > 0 
        ? results.join('\n') 
        : 'No matches found';
    } catch (error) {
      return `Error searching: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
};

export const globTool: ToolDefinition = {
  name: 'glob',
  description: 'Find files matching a pattern. Returns a list of file paths.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.test.ts")'
      },
      path: {
        type: 'string',
        description: 'Base directory to search from (default: working directory)'
      }
    },
    required: ['pattern']
  },
  execute: async (args: unknown, env: ExecutionEnvironment) => {
    const { pattern, path } = args as { pattern: string; path?: string };
    const searchPath = path ? resolve(env.workDir, path) : env.workDir;
    
    try {
      const results: string[] = [];
      
      function matchGlob(filename: string, pattern: string): boolean {
        const regex = new RegExp(
          '^' + 
          pattern
            .replace(/\*\*/g, '{{GLOBSTAR}}')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '.')
            .replace(/\./g, '\\.')
            .replace(/{{GLOBSTAR}}/g, '.*')
          + '$'
        );
        return regex.test(filename);
      }
      
      async function searchDir(dir: string, relativePrefix: string): Promise<void> {
        const entries = await readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
          const fullPath = join(dir, entry.name);
          
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
              await searchDir(fullPath, relativePath);
            }
          } else if (entry.isFile()) {
            if (matchGlob(relativePath, pattern) || matchGlob(entry.name, pattern)) {
              results.push(fullPath);
            }
          }
        }
      }
      
      await searchDir(searchPath, '');
      
      return results.length > 0 
        ? results.join('\n') 
        : 'No files found';
    } catch (error) {
      return `Error globbing: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
};
