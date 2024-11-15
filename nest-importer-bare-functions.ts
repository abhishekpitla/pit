import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import { glob } from 'glob';

interface Location {
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
}

interface FunctionInfo {
    name: string;
    location: Location;
    filePath: string;
}

interface EndpointInfo {
    path: string;
    method: string;
    location: Location;
    handlerName: string;
    dependencies: FunctionInfo[];
}

interface AnalysisResult {
    [endpoint: string]: {
        method: string;
        location: Location;
        functions: FunctionInfo[];
        filePath: string;
    };
}

class NestJSAnalyzer {
    private visitedFiles: Set<string> = new Set();
    private functionDependencies: Set<FunctionInfo> = new Set();
    private currentFilePath: string = '';
    private sourceFile: ts.SourceFile | null = null;

    async analyze(projectPath: string): Promise<AnalysisResult> {
        const endpoints: AnalysisResult = {};
        const controllers = await this.findControllerFiles(projectPath);

        for (const controllerPath of controllers) {
            this.visitedFiles.clear();
            this.currentFilePath = controllerPath;
            this.sourceFile = this.parseTypeScriptFile(controllerPath);
            this.analyzeController(this.sourceFile, endpoints);
        }

        return endpoints;
    }

    private getLineAndColumn(pos: number): { line: number; column: number } {
        if (!this.sourceFile) return { line: 0, column: 0 };
        const lineAndChar = this.sourceFile.getLineAndCharacterOfPosition(pos);
        return {
            line: lineAndChar.line + 1,
            column: lineAndChar.character + 1
        };
    }

    private getNodeLocation(node: ts.Node): Location {
        const start = this.getLineAndColumn(node.getStart());
        const end = this.getLineAndColumn(node.getEnd());
        return {
            startLine: start.line,
            endLine: end.line,
            startColumn: start.column,
            endColumn: end.column
        };
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
                        location: this.getNodeLocation(member),
                        functions: Array.from(this.functionDependencies),
                        filePath: this.currentFilePath
                    };
                }
            }
        });
    }

    private extractControllerPath(classNode: ts.ClassDeclaration): string | null {
        const decorator = classNode.decorators?.find(d => {
            const callExp = d.expression as ts.CallExpression;
            return ts.isIdentifier(callExp.expression) && callExp.expression.text === 'Controller';
        });

        if (!decorator) return null;

        const callExp = decorator.expression as ts.CallExpression;
        const arg = callExp.arguments[0];
        
        if (ts.isStringLiteral(arg)) {
            return arg.text;
        }
        
        return '';
    }

    private analyzeEndpoint(method: ts.MethodDeclaration, controllerPath: string): EndpointInfo | null {
        const httpDecorator = method.decorators?.find(d => {
            const callExp = d.expression as ts.CallExpression;
            return ts.isIdentifier(callExp.expression) && 
                   ['Get', 'Post', 'Put', 'Delete', 'Patch'].includes(callExp.expression.text);
        });

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
            location: this.getNodeLocation(method),
            handlerName: method.name.getText(),
            dependencies: []
        };
    }

    private analyzeFunctionDependencies(node: ts.Node) {
        const visit = (node: ts.Node) => {
            if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
                const functionName = node.expression.text;
                this.functionDependencies.add({
                    name: functionName,
                    location: this.getNodeLocation(node),
                    filePath: this.currentFilePath
                });
            }
            
            if (ts.isPropertyAccessExpression(node)) {
                const functionName = node.getName();
                if (functionName) {
                    this.functionDependencies.add({
                        name: functionName,
                        location: this.getNodeLocation(node),
                        filePath: this.currentFilePath
                    });
                }
            }

            ts.forEachChild(node, visit);
        };

        ts.forEachChild(node, visit);
    }

    private formatOutput(results: AnalysisResult): string {
        let output = 'NestJS Endpoint Analysis Results:\n\n';
        
        for (const [endpoint, info] of Object.entries(results)) {
            output += `Endpoint: ${endpoint}\n`;
            output += `Method: ${info.method}\n`;
            output += `Location: Lines ${info.location.startLine}-${info.location.endLine} in ${info.filePath}\n`;
            output += 'Function Dependencies:\n';
            
            info.functions.forEach(func => {
                output += `  - ${func.name}\n`;
                output += `    Location: Lines ${func.location.startLine}-${func.location.endLine}\n`;
                output += `    File: ${func.filePath}\n`;
            });
            
            output += '\n';
        }
        
        return output;
    }
}

// Usage example
async function analyzeNestJSProject(projectPath: string) {
    const analyzer = new NestJSAnalyzer();
    const results = await analyzer.analyze(projectPath);
    
    // Print formatted results
    console.log(analyzer['formatOutput'](results));
    
    // Also save JSON output for programmatic use
    fs.writeFileSync(
        'nest-analysis-results.json',
        JSON.stringify(results, null, 2)
    );
}

// Run the analyzer
if (require.main === module) {
    const projectPath = process.argv[2] || process.cwd();
    analyzeNestJSProject(projectPath).catch(console.error);
}
