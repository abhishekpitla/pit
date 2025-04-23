package main

import (
	"os"
	"path/filepath"
	"testing"
	"io/ioutil"
)

func TestFindGitRoot_Directory(t *testing.T) {
	tmpDir, err := ioutil.TempDir("", "gitroot-test-dir-")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	gitDir := filepath.Join(tmpDir, ".git")
	if err := os.Mkdir(gitDir, 0755); err != nil {
		t.Fatalf("failed to create .git dir: %v", err)
	}

	root, err := findGitRoot(tmpDir)
	if err != nil {
		t.Fatalf("expected to find git root, got error: %v", err)
	}
	if root != tmpDir {
		t.Errorf("expected root %q, got %q", tmpDir, root)
	}
}

func TestFindGitRoot_NoGit(t *testing.T) {
	tmpDir, err := ioutil.TempDir("", "gitroot-test-nogit-")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	_, err = findGitRoot(tmpDir)
	if err == nil {
		t.Fatalf("expected error for non-git dir, got nil")
	}
}

func TestFindGitRoot_GitFile(t *testing.T) {
	tmpDir, err := ioutil.TempDir("", "gitroot-test-file-")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	gitFile := filepath.Join(tmpDir, ".git")
	content := []byte("gitdir: /tmp/somewhere-else\n")
	if err := ioutil.WriteFile(gitFile, content, 0644); err != nil {
		t.Fatalf("failed to create .git file: %v", err)
	}

	root, err := findGitRoot(tmpDir)
	if err != nil {
		t.Fatalf("expected to find git root with .git file, got error: %v", err)
	}
	if root != tmpDir {
		t.Errorf("expected root %q, got %q", tmpDir, root)
	}
}
