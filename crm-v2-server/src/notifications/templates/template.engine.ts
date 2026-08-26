// DEFAULT import, not `import * as`. mustache is CommonJS, and under Bun a
// namespace import yields the module record rather than the callable API —
// `Mustache.render` comes back undefined and every templated email fails with
// "Mustache.render is not a function". Silent, because the send is wrapped in
// a try/catch that only logs: staging logged 2,076 of these in 24 hours and
// nobody noticed. email-templates.service.ts already imports it this way,
// which is why that path worked while this one did not.
import Mustache from 'mustache';
import { promises as fs } from 'fs';
import { ITemplateEngine, TemplateData } from '../interfaces';

export class MustacheTemplateEngine implements ITemplateEngine {
  private cache: Map<string, string>;
  private cacheEnabled: boolean;

  constructor(cacheEnabled: boolean = true) {
    this.cache = new Map();
    this.cacheEnabled = cacheEnabled;
  }

  compile(template: string, data: TemplateData): string {
    return Mustache.render(template, data);
  }

  async compileFromFile(
    templatePath: string,
    data: TemplateData,
  ): Promise<string> {
    let templateContent: string;

    if (this.cacheEnabled && this.cache.has(templatePath)) {
      templateContent = this.cache.get(templatePath)!;
    } else {
      templateContent = await fs.readFile(templatePath, 'utf-8');

      if (this.cacheEnabled) {
        this.cache.set(templatePath, templateContent);
      }
    }

    return Mustache.render(templateContent, data);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
