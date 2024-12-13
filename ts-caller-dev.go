//go:build dev

package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
)

func executeTypeScriptProcess(absPath, pipeName string) *exec.Cmd {
	cmd := exec.Command("npx", "ts-node", "/Users/prasshan/Desktop/Repos/pit/ts_src/ffi/called.ts", absPath, pipeName)
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		fmt.Printf("Error starting TypeScript process: %s\n", err)
		os.Exit(1)
	}
	return cmd
}
