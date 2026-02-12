import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { geminiCliSystemPrompt } from './system-prompts/gemini-cli.js';
import { globTool, grepTool, readFileTool, shellTool, writeFileTool } from './tools-common.js';
import type { ExecutionEnvironment, ProviderProfile, ToolDefinition } from './types.js';

const editFileTool: ToolDefinition = {
  name: 'edit_file',
  description: `Replace an exact string occurrence in a file.

The old_string must match exactly including whitespace. For multiple occurrences,
use replace_all option or provide more context to make the match unique.

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
        description: 'Exact text to replace including all whitespace'
      },
      new_string: { 
        type: 'string',
        description: 'Replacement text'
      },
      replace_all: { 
        type: 'boolean', 
        default: false,
        description: 'Replace all occurrences if true'
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
      let occurrences = 0;
      let pos = 0;
      while ((pos = content.indexOf(old_string, pos)) !== -1) {
        occurrences++;
        pos += old_string.length;
      }
      
      if (occurrences === 0) {
        return `Error: old_string not found in file. Ensure exact match including whitespace.`;
      }
      
      if (occurrences > 1 && !replace_all) {
        return `Error: old_string appears ${occurrences} times. Use replace_all: true or make the match more specific.`;
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

export const geminiProfile: ProviderProfile = {
  id: 'gemini',
  displayName: 'Google (Gemini)',
  tools: [
    readFileTool,
    editFileTool,
    writeFileTool,
    shellTool,
    grepTool,
    globTool
  ],
  systemPromptTemplate: geminiCliSystemPrompt,
  defaultModel: 'gemini-2.0-flash-exp',
  supportsCaching: false,
  supportsReasoning: true,
  supportsMultimodal: true
};
