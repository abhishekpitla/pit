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
	"time"

	"github.com/briandowns/spinner"
	"github.com/fatih/color"
	"github.com/go-git/go-git/v5"
)

func findGitRoot(path string) (string, error) {
	// Convert to absolute path first
	path, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}

	current := path
	for {
		gitDir := filepath.Join(current, ".git")
		fi, err := os.Stat(gitDir)
		if err == nil {
			if fi.IsDir() {
				return current, nil
			}

			// Handle git submodules or worktrees where .git is a file
			if fi.Mode().IsRegular() {
				contents, err := os.ReadFile(gitDir)
				if err != nil {
					return "", err
				}

				// If it's a gitdir reference file, it's still a valid repository
				if len(contents) > 8 && string(contents[:8]) == "gitdir: " {
					return current, nil
				}
			}
		}

		parent := filepath.Dir(current)
		if parent == current {
			return "", fmt.Errorf("not a git repository (or any parent up to root)")
		}
		current = parent
	}
}

func validateCommandLineArgs() string {
	if len(os.Args) < 2 {
		inputPath, err := os.Getwd()
		if err != nil {
			fmt.Println("Error getting current working directory", err)
			os.Exit(1)
		}
		return inputPath
	}
	return os.Args[1]
}

func validateTypeScriptFile(tsPath string) string {
	cleanPath := filepath.Clean(tsPath)
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

	return cleanPath
}

func printPaths(gitRoot, absPath, framework string) {
	// Labels
	label := color.New(color.FgWhite, color.Bold)
	// Values - Using cyan which is popular in modern CLIs
	value := color.New(color.FgCyan)
	frameWorkValue := color.New(color.FgBlue)

	label.Print("Git root: ")
	value.Printf("%s\n", gitRoot)

	label.Print("Framework: ")
	frameWorkValue.Printf("%s\n", framework)

	label.Print("TypeScript entrypoint: ")
	value.Printf("%s\n", absPath)
}

func setupPipe() string {
	pipeName := "/tmp/pip_pipe"
	if err := createPipe(pipeName); err != nil {
		fmt.Printf("Error creating named pipe: %s\n", err)
		os.Exit(1)
	}
	return pipeName
}

func setupSignalHandler(pipeName string) {
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		os.Remove(pipeName)
		os.Exit(0)
	}()
}

func executeTypeScriptProcess(absPath, pipeName string) *exec.Cmd {
	cmd := exec.Command("npx", "ts-node", "/Users/prasshan/Desktop/Repos/pit/ts_src/ffi/called.ts", absPath, pipeName)
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		fmt.Printf("Error starting TypeScript process: %s\n", err)
		os.Exit(1)
	}
	return cmd
}

func readFunctionsFromPipe(pipe *os.File) []FunctionRange {
	var functions []FunctionRange
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
		functions = append(functions, functionBatch...)
	}
	return functions
}

func main() {
	inputPath := validateCommandLineArgs()
	// cleanPath := validateTypeScriptFile(tsPath)

	absPath, err := filepath.Abs(inputPath)
	if err != nil {
		fmt.Printf("Error getting absolute path: %s\n", err)
		os.Exit(1)
	}
	gitRoot, err := findGitRoot(absPath)
	if err != nil {
		fmt.Println("Error finding git root", err)
		os.Exit(1)
	}
	mainPath, framework, err := DetectFramework(gitRoot)
	if framework == 0 {
		fmt.Println("No supported framework found")
		os.Exit(1)
	}

	printPaths(gitRoot, mainPath, framework.String())

	pipeName := setupPipe()
	setupSignalHandler(pipeName)

	s := spinner.New(spinner.CharSets[43], 100*time.Millisecond)
	s.Color("yellow") // Colors the spinner characters
	s.Prefix = color.YellowString("Waiting for Typescript parser ")
	s.Start()

	cmd := executeTypeScriptProcess(mainPath, pipeName)

	pipe, err := os.OpenFile(pipeName, os.O_RDONLY, os.ModeNamedPipe)
	if err != nil {
		fmt.Printf("Error opening named pipe: %s\n", err)
		os.Exit(1)
	}
	defer pipe.Close()
	defer os.Remove(pipeName)
	functions := readFunctionsFromPipe(pipe)

	if err := cmd.Wait(); err != nil {
		s.Stop()
		fmt.Printf("TypeScript process failed: %s\n", err)
		os.Exit(1)
	}
	s.Stop()

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

	addFunctions := make(map[string]bool)
	removeFunctions := make(map[string]bool)

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
					addFunctions[fn] = true
				}

				lineNo += len(lines)

			case 1: // Deletion
				// fmt.Printf("Deleted from %s (lines %d-%d):\n%s",
				// 	filename, startLine, endLine, chunk.Content())
				chunkAffectedFunctions := findFunctionsWithOverlappingChunks(functions, filename, startLine, endLine)
				for _, fn := range chunkAffectedFunctions {
					removeFunctions[fn] = true
				}

				lineNo += len(lines)

				// Don't increment lineNo for deletions as they don't affect the final line numbers

			case 0: // Context
				lineNo += len(lines)
			}
		}
	}

	// Convert map to slice for final result
	addResult := make([]string, 0, len(addFunctions))
	removeResult := make([]string, 0, len(removeFunctions))
	for fn := range addFunctions {
		addResult = append(addResult, fn)
	}
	for fn := range removeFunctions {
		removeResult = append(removeResult, fn)
	}

	printBothResults(addResult, removeResult, "last commit")
}
func printBothResults(adds, deletes []string, treeType string) {
	addLen := len(adds)
	delLen := len(deletes)
	if addLen > 0 {
		fmt.Printf("Functions with additions in %s:\n", treeType)
		prettyPrintResult(adds, true) // true for add
	}
	if delLen > 0 && addLen > 0 {
		fmt.Println()
	}
	if delLen > 0 {
		fmt.Printf("Functions with deletions in %s:\n", treeType)
		prettyPrintResult(deletes, false)
	}
	if addLen == 0 && delLen == 0 {
		fmt.Printf("No functions changed in %s\n", treeType)
	}
}
func prettyPrintResult(result []string, add bool) {

	verb := color.New(color.FgRed)
	if add {
		verb = color.New(color.FgGreen)
	}
	blue := color.New(color.FgBlue)
	for _, s := range result {
		parts := strings.SplitN(s, " ", 2)
		fmt.Print("\t") // Add tab at start of each line
		if len(parts) == 1 {
			verb.Println(parts[0])
		} else {
			verb.Print(parts[0])
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
