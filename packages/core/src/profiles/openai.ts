import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openaiCodexSystemPrompt } from './system-prompts/openai-codex.js';
import { globTool, grepTool, readFileTool, shellTool, writeFileTool } from './tools-common.js';
import type { ExecutionEnvironment, ProviderProfile, ToolDefinition } from './types.js';

interface PatchHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

interface PatchFile {
  oldPath: string;
  newPath: string;
  hunks: PatchHunk[];
  isNew: boolean;
  isDeleted: boolean;
}

function parseV4aPatch(patch: string): PatchFile[] {
  const files: PatchFile[] = [];
  const lines = patch.split('\n');
  let currentFile: PatchFile | null = null;
  let currentHunk: PatchHunk | null = null;
  let inHunk = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip separator lines
    if (line === '***') continue;
    
    // Start of a file diff
    if (line.startsWith('--- ')) {
      if (currentFile) {
        files.push(currentFile);
      }
      const oldPath = line.slice(4).trim();
      currentFile = {
        oldPath,
        newPath: oldPath,
        hunks: [],
        isNew: false,
        isDeleted: false
      };
      inHunk = false;
      continue;
    }
    
    // New path
    if (line.startsWith('+++ ')) {
      if (currentFile) {
        currentFile.newPath = line.slice(4).trim();
        currentFile.isNew = currentFile.oldPath === '/dev/null';
        currentFile.isDeleted = currentFile.newPath === '/dev/null';
      }
      continue;
    }
    
    // Hunk header
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      if (currentHunk && currentFile) {
        currentFile.hunks.push(currentHunk);
      }
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: parseInt(hunkMatch[2] || '1', 10),
        newStart: parseInt(hunkMatch[3], 10),
        newCount: parseInt(hunkMatch[4] || '1', 10),
        lines: []
      };
      inHunk = true;
      continue;
    }
    
    // Hunk content
    if (inHunk && currentHunk) {
      if (line.startsWith(' ') || line.startsWith('-') || line.startsWith('+')) {
        currentHunk.lines.push(line);
      } else if (line.length === 0) {
        // Empty lines in context are preserved
        currentHunk.lines.push(' ');
      }
    }
  }
  
  // Push final hunk and file
  if (currentHunk && currentFile) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile) {
    files.push(currentFile);
  }
  
  return files;
}

const applyPatchTool: ToolDefinition = {
  name: 'apply_patch',
  description: `Apply a patch to modify files. Uses v4a format.
Supports creating, updating, and deleting files in a single operation.

Example patch format:
***
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,5 +1,5 @@
 function hello() {
-  console.log("old");
+  console.log("new");
 }
***

Always verify patches are correct before applying.`,
  parameters: {
    type: 'object',
    properties: {
      patch: {
        type: 'string',
        description: 'Patch content in v4a format'
      }
    },
    required: ['patch']
  },
  execute: async (args: unknown, env: ExecutionEnvironment) => {
    const { patch } = args as { patch: string };
    
    try {
      const files = parseV4aPatch(patch);
      const results: string[] = [];
      
      for (const file of files) {
        // Determine the actual path (strip a/ or b/ prefix if present)
        let targetPath = file.newPath;
        if (targetPath.startsWith('a/') || targetPath.startsWith('b/')) {
          targetPath = targetPath.slice(2);
        }
        if (targetPath === '/dev/null') {
          targetPath = file.oldPath;
          if (targetPath.startsWith('a/') || targetPath.startsWith('b/')) {
            targetPath = targetPath.slice(2);
          }
        }
        
        const fullPath = resolve(env.workDir, targetPath);
        
        if (file.isDeleted) {
          // Handle deletion
          results.push(`Deleted: ${targetPath}`);
          continue;
        }
        
        if (file.isNew) {
          // Handle new file creation
          const newContent = file.hunks.flatMap(h => 
            h.lines.filter(l => l.startsWith('+') || l.startsWith(' '))
              .map(l => l.slice(1))
          ).join('\n');
          await writeFile(fullPath, newContent, 'utf-8');
          results.push(`Created: ${targetPath}`);
          continue;
        }
        
        // Handle modification
        let content = await readFile(fullPath, 'utf-8');
        const lines = content.split('\n');
        
        // Apply hunks in reverse order to maintain line numbers
        for (const hunk of [...file.hunks].reverse()) {
          const startIndex = hunk.oldStart - 1;
          
          const newLines: string[] = [];
          for (const line of hunk.lines) {
            if (line.startsWith('+') || line.startsWith(' ')) {
              newLines.push(line.slice(1));
            }
            // Lines starting with - are skipped (deleted)
          }
          
          lines.splice(startIndex, hunk.oldCount, ...newLines);
        }
        
        await writeFile(fullPath, lines.join('\n'), 'utf-8');
        results.push(`Modified: ${targetPath}`);
      }
      
      return `Patch applied successfully:\n${results.join('\n')}`;
    } catch (error) {
      return `Error applying patch: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
};

export const openaiProfile: ProviderProfile = {
  id: 'openai',
  displayName: 'OpenAI (Codex)',
  tools: [
    readFileTool,
    applyPatchTool,
    writeFileTool,
    shellTool,
    grepTool,
    globTool
  ],
  systemPromptTemplate: openaiCodexSystemPrompt,
  defaultModel: 'gpt-4o',
  supportsCaching: true,
  supportsReasoning: true,
  supportsMultimodal: true
};
