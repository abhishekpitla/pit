import * as fs from "fs";
import * as path from "path";

enum FrameworkType {
  Unknown = "Unknown",
  Express = "Express",
  NestJS = "NestJS",
  Fastify = "Fastify",
  Koa = "Koa",
  Hapi = "Hapi",
  Sails = "Sails",
  Meteor = "Meteor",
  Loopback = "Loopback",
  Adonis = "Adonis",
  Feathers = "Feathers",
}

interface PackageJSON {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

class FrameworkDetectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameworkDetectionError";
  }
}

export async function DetectFramework(absPath: string): Promise<{
  mainPath: string;
  framework: FrameworkType;
}> {
  // Read package.json
  const packageJSONPath = path.join(absPath, "package.json");
  let packageData: string;
  try {
    packageData = await fs.promises.readFile(packageJSONPath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read package.json: ${err.message}`);
  }

  let pkg: PackageJSON;
  try {
    pkg = JSON.parse(packageData);
  } catch (err) {
    throw new Error(`Invalid JSON in package.json: ${err.message}`);
  }

  const hasDependency = (name: string): boolean => {
    return (
      !!pkg.dependencies?.[name] || !!pkg.devDependencies?.[name]
    );
  };

  // Framework detection logic
  if (hasDependency("@nestjs/core")) {
    const mainPath = path.join(absPath, "src", "main.ts");
    if (await pathExists(mainPath)) {
      return { mainPath, framework: FrameworkType.NestJS };
    }
  }

  if (hasDependency("@adonisjs/core")) {
    const mainPath = path.join(absPath, "start", "app.ts");
    if (await pathExists(mainPath)) {
      return { mainPath, framework: FrameworkType.Adonis };
    }
  }

  if (hasDependency("@loopback/core")) {
    const mainPath = path.join(absPath, "src", "index.ts");
    if (await pathExists(mainPath)) {
      return { mainPath, framework: FrameworkType.Loopback };
    }
  }

  if (await pathExists(path.join(absPath, ".meteor"))) {
    const mainPath = path.join(absPath, "client", "main.js");
    return { mainPath, framework: FrameworkType.Meteor };
  }

  if (hasDependency("sails")) {
    const mainPath = path.join(absPath, "app.js");
    if (await pathExists(mainPath)) {
      return { mainPath, framework: FrameworkType.Sails };
    }
  }

  if (hasDependency("@feathersjs/feathers")) {
    const mainPath = path.join(absPath, "src", "app.js");
    if (await pathExists(mainPath)) {
      return { mainPath, framework: FrameworkType.Feathers };
    }
  }

  if (hasDependency("@hapi/hapi")) {
    const mainPath = path.join(absPath, "server.js");
    if (await pathExists(mainPath)) {
      return { mainPath, framework: FrameworkType.Hapi };
    }
  }

  if (hasDependency("koa")) {
    const mainPath = path.join(absPath, "app.js");
    if (await pathExists(mainPath)) {
      return { mainPath, framework: FrameworkType.Koa };
    }
  }

  if (hasDependency("fastify")) {
    const possiblePaths = [
      path.join(absPath, "app.js"),
      path.join(absPath, "server.js"),
      path.join(absPath, "index.js"),
    ];
    for (const mainPath of possiblePaths) {
      if (await pathExists(mainPath)) {
        return { mainPath, framework: FrameworkType.Fastify };
      }
    }
  }

  if (hasDependency("express")) {
    const possiblePaths = [
      path.join(absPath, "app.js"),
      path.join(absPath, "server.js"),
      path.join(absPath, "index.js"),
    ];
    for (const mainPath of possiblePaths) {
      if (await pathExists(mainPath)) {
        return { mainPath, framework: FrameworkType.Express };
      }
    }
  }

  throw new FrameworkDetectionError("Unable to determine framework type");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// Example usage:
// (async () => {
//   try {
//     const { mainPath, framework } = await DetectFramework("/path/to/project");
//     console.log(`Framework: ${framework}, Main file: ${mainPath}`);
//   } catch (error) {
//     console.error(error);
//   }
// })();

