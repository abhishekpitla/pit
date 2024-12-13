import * as fs from 'fs';
import { CallInfo } from 'ts_src/common/analyzer';
export interface FunctionRange {
    ControllerName: string;
    FunctionName: string;
    Filename: string;
    StartLine: number;
    EndLine: number;
}
export async function writeToNamedPipe(
    callInfoArray: CallInfo[],
    pipePath: string,
    published_path: string
): Promise<void> {
    // Transform CallInfo array to FunctionRange array
    const functionRanges: FunctionRange[] = callInfoArray.map(callInfo => ({
        ControllerName: published_path ?? undefined,
        FunctionName: callInfo.name.replaceAll('\n', ''),
        Filename: callInfo.location.filePath,
        StartLine: callInfo.location.startLine,
        EndLine: callInfo.location.endLine
    }));

    // Convert to JSON string
    const jsonData = JSON.stringify(functionRanges);

    try {
        // Check if pipe exists
        if (!fs.existsSync(pipePath)) {
            throw new Error(`Named pipe does not exist at path: ${pipePath}`);
        }

        // Open the pipe for writing
        const writeStream = fs.createWriteStream(pipePath);

        return new Promise((resolve, reject) => {
            writeStream.on('error', error => {
                reject(error);
            });

            writeStream.on('finish', () => {
                resolve();
            });

            // Write the JSON data
            writeStream.write(jsonData);
            writeStream.end();
        });
    } catch (error) {
        throw new Error(`Failed to write to named pipe: ${error.message}`);
    }
}
