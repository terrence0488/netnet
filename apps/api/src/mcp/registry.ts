import { createHoldingTool } from './tools/create-holding';
import { deleteHoldingTool } from './tools/delete-holding';
import { deleteTagTool } from './tools/delete-tag';
import { deleteTypeTool } from './tools/delete-type';
import { deleteValueTool } from './tools/delete-value';
import { getFinancialContextTool } from './tools/get-financial-context';
import { getHoldingTool } from './tools/get-holding';
import { getNetWorthHistoryTool } from './tools/get-net-worth-history';
import { getSetupGuideTool } from './tools/get-setup-guide';
import { getTaxonomyTool } from './tools/get-taxonomy';
import { listHoldingsTool } from './tools/list-holdings';
import { recordValuesTool } from './tools/record-values';
import { updateHoldingTool } from './tools/update-holding';
import { updateValueTool } from './tools/update-value';
import { upsertTagTool } from './tools/upsert-tag';
import { upsertTypeTool } from './tools/upsert-type';
import type { ToolDef } from './tool';

/**
 * P1's sixteen tools (architecture §7.4), in the order `tools/list` shows them: the summary
 * first, then reads, then writes. `list_activity` and `undo` come with P3, `get_period_changes`
 * with P5.
 */
export const TOOL_REGISTRY: readonly ToolDef[] = [
  getFinancialContextTool,
  listHoldingsTool,
  getHoldingTool,
  getNetWorthHistoryTool,
  getTaxonomyTool,
  getSetupGuideTool,
  createHoldingTool,
  updateHoldingTool,
  deleteHoldingTool,
  recordValuesTool,
  updateValueTool,
  deleteValueTool,
  upsertTypeTool,
  deleteTypeTool,
  upsertTagTool,
  deleteTagTool,
];
