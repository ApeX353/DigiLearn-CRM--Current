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
