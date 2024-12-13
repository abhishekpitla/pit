import { Project } from 'ts-morph';
import { extractController } from '../../ts_src/route-extractor/nestjs';
import chalk from 'chalk';
import path from 'path';
import { processControllerFunctions } from 'ts_src/common/analyzer';

async function main() {
    const pipePath = process.argv[3];
    const filePath = process.argv[2];

    if (!pipePath) {
        console.error('Please provide the named pipe path as an argument');
        process.exit(1);
    } else {
        console.log(pipePath);
    }

    try {
        const absolutePath = path.resolve(process.cwd(), filePath);
        const controllers = extractController(absolutePath);
        processControllerFunctions(controllers, pipePath);
        console.error('Finished TS');
    } catch (error) {
        console.error(chalk.red('Error analyzing function:'), error);
        process.exit(1);
    }
}
main();
