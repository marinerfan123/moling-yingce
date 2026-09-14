import { ProjectsService, type Principal } from "./projects.service.js";

export class ProjectsController {
  constructor(private readonly projects = new ProjectsService()) {}

  create(principal: Omit<Principal, "memberships">, body: { title: string; firstEpisodeTitle?: string }) {
    return this.projects.createProject(principal, body);
  }

  list(principal: Principal) {
    return this.projects.listProjects(principal);
  }
}
