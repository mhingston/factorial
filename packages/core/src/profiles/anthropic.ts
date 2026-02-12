import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { anthropicClaudeSystemPrompt } from './system-prompts/anthropic-claude.js';
import { globTool, grepTool, readFileTool, shellTool, writeFileTool } from './tools-common.js';
import type { ExecutionEnvironment, ProviderProfile, ToolDefinition } from './types.js';

const editFileTool: ToolDefinition = {
  name: 'edit_file',
  description: `Replace an exact string occurrence in a file.

The old_string MUST match exactly (including whitespace) and must be unique in the file.
If old_string appears multiple times, the operation will fail unless replace_all is true.

Always read the file first to get the exact content.`,
  parameters: {
    type: 'object',
    properties: {
      file_path: { 
        type: 'string',
        description: 'Path to the file to edit'
      },
      old_string: { 
        type: 'string',
        description: 'Exact text to replace (including whitespace and indentation)'
      },
      new_string: { 
        type: 'string',
        description: 'Replacement text'
      },
      replace_all: { 
        type: 'boolean', 
        default: false,
        description: 'If true, replace all occurrences of old_string'
      }
    },
    required: ['file_path', 'old_string', 'new_string']
  },
  execute: async (args: unknown, env: ExecutionEnvironment) => {
    const { file_path, old_string, new_string, replace_all = false } = args as { 
      file_path: string; 
      old_string: string; 
      new_string: string;
      replace_all?: boolean;
    };
    
    const fullPath = resolve(env.workDir, file_path);
    
    try {
      const content = await readFile(fullPath, 'utf-8');
      
      // Count occurrences
      const occurrences = content.split(old_string).length - 1;
      
      if (occurrences === 0) {
        return `Error: old_string not found in file. The text must match exactly including whitespace.`;
      }
      
      if (occurrences > 1 && !replace_all) {
        return `Error: old_string appears ${occurrences} times in the file. Use replace_all: true to replace all occurrences, or make old_string more specific to match a unique section.`;
      }
      
      const newContent = replace_all 
        ? content.split(old_string).join(new_string)
        : content.replace(old_string, new_string);
      
      await writeFile(fullPath, newContent, 'utf-8');
      
      const count = replace_all ? occurrences : 1;
      return `Successfully replaced ${count} occurrence(s) in ${file_path}`;
    } catch (error) {
      return `Error editing file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
};

export const anthropicProfile: ProviderProfile = {
  id: 'anthropic',
  displayName: 'Anthropic (Claude Code)',
  tools: [
    readFileTool,
    editFileTool,
    writeFileTool,
    shellTool,
    grepTool,
    globTool
  ],
  systemPromptTemplate: anthropicClaudeSystemPrompt,
  defaultModel: 'claude-3-5-sonnet-20241022',
  supportsCaching: true,
  supportsReasoning: true,
  supportsMultimodal: true
};
