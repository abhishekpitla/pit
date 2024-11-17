/**
 * Prints a full TypeScript object with proper formatting and handling of
 * circular references, functions, and special types.
 */
function printFullObject(obj: any, indent: number = 0, seen: Set<any> = new Set()): string {
    if (obj === null) return 'null';
    if (obj === undefined) return 'undefined';
    
    // Handle circular references
    if (seen.has(obj)) return '[Circular Reference]';
    seen.add(obj);
    
    const indentStr = ' '.repeat(indent);
    
    // Handle different types
    switch (typeof obj) {
        case 'string':
            return `"${obj}"`;
        case 'number':
        case 'boolean':
            return obj.toString();
        case 'function':
            return `[Function: ${obj.name || 'anonymous'}]`;
        case 'symbol':
            return obj.toString();
        case 'bigint':
            return `${obj.toString()}n`;
    }
    
    // Handle arrays
    if (Array.isArray(obj)) {
        if (obj.length === 0) return '[]';
        
        const items = obj.map(item => 
            `${indentStr}  ${printFullObject(item, indent + 2, seen)}`
        ).join(',\n');
        
        return `[\n${items}\n${indentStr}]`;
    }
    
    // Handle Date objects
    if (obj instanceof Date) {
        return `Date(${obj.toISOString()})`;
    }
    
    // Handle RegExp
    if (obj instanceof RegExp) {
        return obj.toString();
    }
    
    // Handle plain objects
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    
    const properties = entries.map(([key, value]) => {
        const formattedValue = printFullObject(value, indent + 2, seen);
        return `${indentStr}  "${key}": ${formattedValue}`;
    }).join(',\n');
    
    return `{\n${properties}\n${indentStr}}`;
}

// Helper function to both stringify and console.log the object
export function printObject(obj: any): void {
    console.log(printFullObject(obj));
}
printObject({"hello":"world"})

