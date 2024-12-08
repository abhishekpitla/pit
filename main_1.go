package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/go-git/go-git/v5"

	"github.com/fatih/color"
)

func main() {
	// Check if TypeScript file path is provided
	if len(os.Args) < 2 {
		fmt.Println("Usage: program <path-to-ts-file>")
		os.Exit(1)
	}

	// Get and validate TypeScript file path
	tsPath := os.Args[1]
	cleanPath := filepath.Clean(tsPath)

	// Check if file exists and is .ts
	if filepath.Ext(cleanPath) != ".ts" {
		fmt.Println("Error: File must be a TypeScript file (.ts)")
		os.Exit(1)
	}

	_, err := os.Stat(cleanPath)
	if err != nil {
		if os.IsNotExist(err) {
			fmt.Printf("File does not exist: %s\n", cleanPath)
		} else {
			fmt.Printf("Error accessing file: %s\n", err)
		}
		os.Exit(1)
	}

	// Get absolute path of the TypeScript file
	absPath, err := filepath.Abs(cleanPath)
	if err != nil {
		fmt.Printf("Error getting absolute path: %s\n", err)
		os.Exit(1)
	}

	// Find git repository root from the TypeScript file's location
	dir := filepath.Dir(absPath)
	gitRoot := ""
	for dir != "/" && dir != "." {
		if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
			gitRoot = dir
			break
		}
		dir = filepath.Dir(dir)
	}

	if gitRoot == "" {
		fmt.Println("Error: TypeScript file is not in a git repository")
		os.Exit(1)
	}

	grey := color.New(color.FgHiBlack) // "bright black" is grey
	grey.Printf("Git root: %s\n", gitRoot)
	grey.Printf("TypeScript entrypoint: %s\n", absPath)

	// Create and execute TypeScript child process
	// Create a named pipe
	pipeName := "/tmp/pip_pipe"
	pipeErr := createPipe(pipeName)
	if pipeErr != nil {
		fmt.Printf("Error creating named pipe: %s\n", err)
		os.Exit(1)
	}
	defer os.Remove(pipeName) // Clean up the pipe when done
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		os.Remove(pipeName)
		os.Exit(0)
	}()
	// Modify the command to use the pipe
	cmd := exec.Command("npx", "ts-node", "./ts_src/ffi/called.ts", absPath, pipeName)
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		fmt.Printf("Error starting TypeScript process: %s\n", err)
		os.Exit(1)
	}

	// Open the pipe for reading
	pipe, err := os.OpenFile(pipeName, os.O_RDONLY, os.ModeNamedPipe)
	if err != nil {
		fmt.Printf("Error opening named pipe: %s\n", err)
		os.Exit(1)
	}
	defer pipe.Close()

	// Read from the pipe
	// data, err := io.ReadAll(pipe)
	// if err != nil {
	// 	fmt.Printf("Error reading from pipe: %s\n", err)
	// 	os.Exit(1)
	// }
	// fmt.Println(string(data))

	var functions []FunctionRange
	// log.Println("Reading from Pipe")

	decoder := json.NewDecoder(pipe)
	for {
		var functionBatch []FunctionRange
		err := decoder.Decode(&functionBatch)
		if err == io.EOF {
			break
		}
		if err != nil {
			fmt.Printf("Error decoding TypeScript output: %s\n", err)
			os.Exit(1)
		}
		// log.Println(functionBatch)
		functions = append(functions, functionBatch...)
		// log.Printf("Received batch of %d functions\n", len(functionBatch))
	}

	if err := cmd.Wait(); err != nil {
		fmt.Printf("TypeScript process failed: %s\n", err)
		os.Exit(1)
	}

	// log.Printf("Total functions received: %d\n", len(functions))
	handleRepo(gitRoot, functions)
}

type FunctionRange struct {
	ControllerName string `json:"ControllerName"`
	FunctionName   string `json:"FunctionName"`
	Filename       string `json:"Filename"`
	StartLine      int    `json:"StartLine"`
	EndLine        int    `json:"EndLine"`
}

func findFunctionsWithOverlappingChunks(functions []FunctionRange, chunkFilename string, chunkStart, chunkEnd int) []string {
	var overlappingFunctions []string

	for _, fn := range functions {
		// log.Printf("Path comparison -> absChunkFilename: %q == absFuncFilename: %q, Equal: %v", chunkFilename,fn.Filename, absChunkFilename == fn.Filename)
		if !strings.Contains(fn.Filename, chunkFilename) {
			continue
		}
		if (chunkStart >= fn.StartLine && chunkStart <= fn.EndLine) ||
			(chunkEnd >= fn.StartLine && chunkEnd <= fn.EndLine) ||
			(chunkStart <= fn.StartLine && chunkEnd >= fn.EndLine) ||
			(chunkStart >= fn.StartLine && chunkEnd <= fn.EndLine) {
			overlappingFunctions = append(overlappingFunctions, fn.ControllerName)
		}
	}

	return overlappingFunctions
}

func handleRepo(repoPath string, functions []FunctionRange) {
	r, err := git.PlainOpen(repoPath)
	if err != nil {
		fmt.Printf("Error opening repository: %v\n", err)
		return
	}
	ref, err := r.Head()
	if err != nil {
		fmt.Printf("Error getting HEAD: %v\n", err)
		return
	}
	commit, err := r.CommitObject(ref.Hash())
	if err != nil {
		fmt.Printf("Error getting commit: %v\n", err)
		return
	}
	parent, err := commit.Parent(0)
	if err != nil {
		fmt.Printf("Error getting parent commit: %v\n", err)
		return
	}
	patch, err := commit.Patch(parent)
	if err != nil {
		fmt.Printf("Error getting patch: %v\n", err)
		return
	}

	affectedFunctions := make(map[string]bool)

	for _, filePatch := range patch.FilePatches() {
		from, to := filePatch.Files()
		filename := "unknown"
		if to != nil {
			filename = to.Path()
		} else if from != nil {
			filename = from.Path()
		}

		lineNo := 1

		for _, chunk := range filePatch.Chunks() {
			lines := strings.Split(chunk.Content(), "\n")
			// Remove last empty line that comes from splitting
			if len(lines) > 0 && lines[len(lines)-1] == "" {
				lines = lines[:len(lines)-1]
			}
			startLine := lineNo
			endLine := lineNo + len(lines) - 1

			switch chunk.Type() {
			case 2: // Addition
				// fmt.Printf("Added in %s (lines %d-%d):\n%s",
				// 	filename, startLine, endLine, chunk.Content())

				// Check for affected functions only on additions
				chunkAffectedFunctions := findFunctionsWithOverlappingChunks(functions, filename, startLine, endLine)
				for _, fn := range chunkAffectedFunctions {
					affectedFunctions[fn] = true
				}

				lineNo += len(lines)

			case 1: // Deletion
				fmt.Printf("Deleted from %s (lines %d-%d):\n%s",
					filename, startLine, endLine, chunk.Content())
				// Don't increment lineNo for deletions as they don't affect the final line numbers

			case 0: // Context
				lineNo += len(lines)
			}
		}
	}

	// Convert map to slice for final result
	result := make([]string, 0, len(affectedFunctions))
	for fn := range affectedFunctions {
		result = append(result, fn)
	}

	prettyPrintResult(result)
}
func prettyPrintResult(result []string) {
    red := color.New(color.FgRed)
    blue := color.New(color.FgBlue)
    for _, s := range result {
        parts := strings.SplitN(s, " ", 2)
        fmt.Print("\t")  // Add tab at start of each line
        if len(parts) == 1 {
            red.Println(parts[0])
        } else {
            red.Print(parts[0])
            blue.Println(" " + parts[1])
        }
    }
}

func createPipe(pipeName string) error {
	// First try to remove any existing pipe
	err := os.Remove(pipeName)
	if err != nil && !os.IsNotExist(err) {
		// If error is not "file not found", return the error
		return fmt.Errorf("failed to remove existing pipe: %w", err)
	}

	// Create new pipe
	err = syscall.Mkfifo(pipeName, 0666)
	if err != nil {
		return fmt.Errorf("failed to create pipe: %w", err)
	}

	return nil
}
