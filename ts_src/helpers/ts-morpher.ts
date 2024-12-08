import { ts,Project, MethodDeclaration, Node } from "ts-morph";

// Convert from ts to ts-morph
export function toTsMorph(tsNode: ts.MethodDeclaration): MethodDeclaration {
    // Check if node is actually a SourceFile
    if (ts.isSourceFile(tsNode)) {
        throw new Error("Expected MethodDeclaration, received SourceFile");
    }

    // Verify it's actually a method declaration
    if (!ts.isMethodDeclaration(tsNode)) {
        throw new Error("Node is not a MethodDeclaration");
    }

    const project = new Project();
    const sourceFile = tsNode.getSourceFile();
    const tsMorphSourceFile = project.createSourceFile("temp.ts", sourceFile.getFullText());
    
    const method = tsMorphSourceFile.getDescendantsOfKind(ts.SyntaxKind.MethodDeclaration)
        .find(m => m.getPos() === tsNode.pos);
    
    if (!method || !Node.isMethodDeclaration(method)) {
        throw new Error("Could not find corresponding method in ts-morph");
    }
    
    return method;
}

// Convert from ts-morph to ts
// function toTs(tsMorphNode: MethodDeclaration): ts.MethodDeclaration {
//     if (!Node.isMethodDeclaration(tsMorphNode)) {
//         throw new Error("Expected MethodDeclaration, received different node type");
//     }
//     
//     return tsMorphNode.compilerNode;
// }
