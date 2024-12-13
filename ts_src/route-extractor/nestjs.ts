import { validFuncDeclarations } from 'ts_src/common/analyzer';
import { findTargetFunctionFromFileString } from '../../ts_src/common/utils';
import * as ts from 'typescript';
import { Project } from 'ts-morph';

interface RouteInfo {
    filename: string;
    controllerName: string;
    path: string;
    nestHttpMethod: string;
    methodNode: ts.MethodDeclaration;
    functionName: string;
}

class NestRouteExtractor {
    private readonly knownHttpDecorators = [
        'Get',
        'Post',
        'Put',
        'Delete',
        'Patch',
        'Options',
        'Head',
        'All'
    ];

    private sourceFile: ts.SourceFile;

    constructor(sourceFile: ts.SourceFile) {
        this.sourceFile = sourceFile;
    }

    private extractMethodInfo(method: ts.MethodDeclaration): {
        methodPath?: string;
        httpMethod?: string;
    } {
        const decorators = ts.getDecorators(method);
        if (!decorators?.length) return {};

        for (const decorator of decorators) {
            if (ts.isCallExpression(decorator.expression)) {
                const decoratorName = decorator.expression.expression.getText(this.sourceFile);
                if (this.knownHttpDecorators.includes(decoratorName)) {
                    const route =
                        decorator.expression.arguments.length > 0
                            ? decorator.expression.arguments[0]
                                  .getText(this.sourceFile)
                                  .replace(/['"]/g, '')
                            : '/';

                    return {
                        methodPath: route,
                        httpMethod: decoratorName.toUpperCase()
                    };
                }
            }
        }

        return {};
    }

    private extractControllerPath(controller: ts.ClassDeclaration): string {
        const decorators = ts.getDecorators(controller);
        if (!decorators?.length) return '';

        for (const decorator of decorators) {
            if (
                ts.isCallExpression(decorator.expression) &&
                decorator.expression.expression.getText(this.sourceFile) === 'Controller'
            ) {
                if (decorator.expression.arguments.length > 0) {
                    return decorator.expression.arguments[0]
                        .getText(this.sourceFile)
                        .replace(/['"]/g, '');
                }
                return '';
            }
        }
        return '';
    }

    public extractRoutes(): RouteInfo[] {
        const routes: RouteInfo[] = [];

        const visit = (node: ts.Node) => {
            if (ts.isClassDeclaration(node)) {
                const decorators = ts.getDecorators(node);
                const isController = decorators?.some(
                    decorator =>
                        ts.isCallExpression(decorator.expression) &&
                        decorator.expression.expression.getText(this.sourceFile) === 'Controller'
                );

                if (isController && node.name) {
                    const controllerPath = this.extractControllerPath(node);

                    for (const member of node.members) {
                        if (ts.isMethodDeclaration(member)) {
                            const { methodPath, httpMethod } = this.extractMethodInfo(member);

                            if (methodPath && httpMethod) {
                                routes.push({
                                    filename: this.sourceFile.fileName,
                                    controllerName: node.name.text,
                                    path: `${controllerPath}/${methodPath}`.replace(/\/+/g, '/'),
                                    nestHttpMethod: httpMethod,
                                    methodNode: member,
                                    functionName: String((member.name as ts.Identifier).escapedText)
                                });
                            }
                        }
                    }
                }
            }
            ts.forEachChild(node, visit);
        };

        visit(this.sourceFile);
        return routes;
    }

    public static extractRoutesFromProgram(program: ts.Program): RouteInfo[] {
        const routes: RouteInfo[] = [];

        for (const sourceFile of program.getSourceFiles()) {
            // console.log(sourceFile.fileName, sourceFile.isDeclarationFile);
            if (!sourceFile.isDeclarationFile) {
                const extractor = new NestRouteExtractor(sourceFile);
                routes.push(...extractor.extractRoutes());
            }
        }

        return routes;
    }
}

function extractController(file: string) {
    const program = ts.createProgram([file], {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true
    });

    const routes = NestRouteExtractor.extractRoutesFromProgram(program);

    // const project = new Project();
    // const project = new Project({
    //     tsConfigFilePath: findTsConfig(filePath)
    // });

    // project.addSourceFileAtPath(file);
    // project.resolveSourceFileDependencies();
    // for (const route of routes) {
    //     // controllerDeclarations.push((route.methodNode.name as ts.Identifier).escapedText);
    //     console.log(
    //         `${route.nestHttpMethod} ${route.path} -> ${route.controllerName}/${(route.methodNode.name as ts.Identifier).escapedText}`
    //     );
    //     delete route.methodNode;
    //     console.log(route);
    // }
    return routes
        .map(obj => {
            return {
                // declaration: findTargetFunctionFromFileString(
                //     project,
                //     obj.filename,
                //     obj.functionName
                // ),
                function_name: obj.functionName,
                file:obj.filename,
                controller: obj.controllerName,
                published_path: obj.nestHttpMethod + ' ' + obj.path
            };
        })
        .filter(m => m != undefined);
}

// console.log(analyzeFiles(['/Users/prasshan/Desktop/Repos/core-backend/src/main.ts']))
export { NestRouteExtractor, RouteInfo, extractController };
