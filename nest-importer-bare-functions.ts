import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { printObject } from './print-helpers.ts';
import { glob } from 'glob';

interface EndpointInfo {
    path: string;
    method: string;
    handlerName: string;
    dependencies: string[];
}

interface AnalysisResult {
    [endpoint: string]: {
        method: string;
        functions: string[];
        filePath: string;
    };
}

class NestJSAnalyzer {
    private visitedFiles: Set<string> = new Set();
    private functionDependencies: Set<string> = new Set();
    private currentFilePath: string = '';

    async analyze(projectPath: string): Promise<AnalysisResult> {
        const endpoints: AnalysisResult = {};
        const controllers = await this.findControllerFiles(projectPath);

        for (const controllerPath of controllers) {
            this.visitedFiles.clear();
            this.currentFilePath = controllerPath;
            
            const sourceFile = this.parseTypeScriptFile(controllerPath);
            this.analyzeController(sourceFile, endpoints);
        }

        return endpoints;
    }

    private async findControllerFiles(projectPath: string): Promise<string[]> {
        return glob('**/*.controller.ts', {
            cwd: projectPath,
            ignore: ['node_modules/**'],
            absolute: true
        });
    }

    private parseTypeScriptFile(filePath: string): ts.SourceFile {
        const content = fs.readFileSync(filePath, 'utf-8');
        return ts.createSourceFile(
            filePath,
            content,
            ts.ScriptTarget.Latest,
            true
        );
    }

    private analyzeController(sourceFile: ts.SourceFile, endpoints: AnalysisResult) {
        const visit = (node: ts.Node) => {
            if (ts.isClassDeclaration(node)) {
                this.analyzeControllerClass(node, endpoints);
            }
            ts.forEachChild(node, visit);
        };

        ts.forEachChild(sourceFile, visit);
    }

    private analyzeControllerClass(classNode: ts.ClassDeclaration, endpoints: AnalysisResult) {
        const controllerPath = this.extractControllerPath(classNode);
        if (!controllerPath) return;

        classNode.members.forEach(member => {
            if (ts.isMethodDeclaration(member)) {
                const endpointInfo = this.analyzeEndpoint(member, controllerPath);
                if (endpointInfo) {
                    this.functionDependencies.clear();
                    this.analyzeFunctionDependencies(member);
                    
                    endpoints[endpointInfo.path] = {
                        method: endpointInfo.method,
                        functions: Array.from(this.functionDependencies),
                        filePath: this.currentFilePath
                    };
                }
            }
        });
    }

    private extractControllerPath(classNode: ts.ClassDeclaration): string | null {
        // Look for Controller decorator in node modifiers
        const decorator = ts.canHaveDecorators(classNode) ? 
            ts.getDecorators(classNode)?.find(d => {
                if (ts.isCallExpression(d.expression)) {
                    const exp = d.expression.expression;
                    return ts.isIdentifier(exp) && exp.text === 'Controller';
                }
                return false;
            }) : undefined;

        if (!decorator) return null;

        const callExp = decorator.expression as ts.CallExpression;
        const arg = callExp.arguments[0];
        
        if (arg && ts.isStringLiteral(arg)) {
            return arg.text;
        }
        
        return '';
    }

    private analyzeEndpoint(method: ts.MethodDeclaration, controllerPath: string): EndpointInfo | null {
        // Look for HTTP method decorators in method modifiers
        const httpDecorator = ts.canHaveDecorators(method) ? 
            ts.getDecorators(method)?.find(d => {
                if (ts.isCallExpression(d.expression)) {
                    const exp = d.expression.expression;
                    return ts.isIdentifier(exp) && 
                           ['Get', 'Post', 'Put', 'Delete', 'Patch'].includes(exp.text);
                }
                return false;
            }) : undefined;

        if (!httpDecorator) return null;

        const callExp = httpDecorator.expression as ts.CallExpression;
        const httpMethod = (callExp.expression as ts.Identifier).text.toUpperCase();
        let endpointPath = '';

        if (callExp.arguments.length > 0 && ts.isStringLiteral(callExp.arguments[0])) {
            endpointPath = callExp.arguments[0].text;
        }

        const fullPath = path.join('/', controllerPath, endpointPath).replace(/\\/g, '/');
        
        return {
            path: fullPath,
            method: httpMethod,
            handlerName: method.name.getText(),
            dependencies: []
        };
    }

    private analyzeFunctionDependencies(node: ts.Node) {
        const visit = (node: ts.Node) => {
            if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
                const functionName = node.expression.text;
                this.functionDependencies.add(functionName);
            }
            
            if (ts.isPropertyAccessExpression(node)) {
                const name = node.name;
                if (ts.isIdentifier(name)) {
                    this.functionDependencies.add(name.text);
                }
            }

            ts.forEachChild(node, visit);
        };

        ts.forEachChild(node, visit);
    }
}

// Usage example
async function analyzeNestJSProject(projectPath: string) {
    const analyzer = new NestJSAnalyzer();
    const results = await analyzer.analyze(projectPath);
    
    console.log('Endpoint Analysis Results:');
    console.log(JSON.stringify(results, null, 2));
}

// Run the analyzer
if (require.main === module) {
    const projectPath = process.argv[2] || process.cwd();
    analyzeNestJSProject(projectPath).catch(console.error);
}
