import { ScriptsService } from "./scripts.service.js";

export class ScriptsController {
  constructor(private readonly scripts = new ScriptsService()) {}

  read(scriptId: string) {
    return this.scripts.read(scriptId);
  }
}
