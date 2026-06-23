import { BusinessLead } from "../schemas/lead.schema.js";

export interface SourceConfig {
  name: string;
  type: string;
  enabled: boolean;
  [key: string]: any;
}

export interface SourceRunInput {
  query?: string;
  area?: string;
  category?: string;
  limit?: number;
  config?: any;
  dryRun?: boolean;
}

export interface LeadSourceAdapter {
  name: string;
  canRun(config: SourceConfig): boolean;
  run(input: SourceRunInput): AsyncGenerator<Partial<BusinessLead>>;
}
