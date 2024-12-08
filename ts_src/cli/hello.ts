import { CallInfo } from 'ts_src/common/analyzer';
import { writeToNamedPipe } from '../helpers/pipe-pusher.ts';

// Sample call data
const calls: CallInfo[] = [
    {
        location: {
            filePath: 'src/modules/beacon/beacon.service.ts',
            startLine: 16,
            endLine: 20
        },
        call_flag: true,
        name: 'tempSetCSBeaconPassword',
        line: 42,
        column: 15,
        type: 'async function',
        arguments: ['userId', 'options']
    },
    {
        location: {
            filePath: 'src/modules/charging-station/charging-station.controller.ts',
            startLine: 5,
            endLine: 15
        },
        call_flag: false,
        name: 'test',
        line: 57,
        column: 8,
        type: 'function',
        arguments: ['data', 'filterConfig']
    }
];

// export async function writeToNamedPipe(callInfoArray: CallInfo[], pipePath: string): Promise<void> {
//     try {
//         const jsonData = JSON.stringify(callInfoArray, null, 2);
//         await writeFile(pipePath, jsonData);
//         console.log('Successfully wrote to named pipe:', pipePath);
//     } catch (error) {
//         console.error('Error writing to named pipe:', error);
//         throw error;
//     }
// }

// Main execution
async function main() {
    const pipePath = process.argv[3];

    if (!pipePath) {
        console.error('Please provide the named pipe path as an argument');
        process.exit(1);
    } else {
        console.log(pipePath);
    }

    try {
        const promises: Promise<void>[] = [];

        for (let i = 0; i < 10; i++) {
            promises.push(
                new Promise<void>(resolve => {
                    setTimeout(async () => {
                        console.log('Done sleeping');
                        await writeToNamedPipe(calls,["HelloWorld"], pipePath);
                        resolve();
                    }, 1000 * i);
                })
            );
        }

        // This will definitely wait for all timeouts and writes
        await Promise.all(promises)
            .then(() => {
                console.log('All writes completed');
                process.exit(0);
            })
            .catch(error => {
                console.error('Error during writes:', error);
                process.exit(1);
            });
        console.log('After sleeping');
    } catch (error) {
        console.error('Failed to write to named pipe:', error);
        process.exit(1);
    }
}

// Run the main function if this file is being executed directly
main();
