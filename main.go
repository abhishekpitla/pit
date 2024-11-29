package main

import (
    "fmt"
    "github.com/go-git/go-git/v5"
)

func main() {
    r, _ := git.PlainOpen(".")
    ref, _ := r.Head()
    commit, _ := r.CommitObject(ref.Hash())
    parent, _ := commit.Parent(0)
    patch, _ := commit.Patch(parent)

    for _, filePatch := range patch.FilePatches() {
        from, to := filePatch.Files()
        filename := "unknown"
        if to != nil {
            filename = to.Path()
        } else if from != nil {
            filename = from.Path()
        }

        for _, chunk := range filePatch.Chunks() {
            switch chunk.Type() {
            case 2:
                fmt.Printf("Added in %s:\n%s\n", filename, chunk.Content())
            case 1:
                fmt.Printf("Deleted from %s:\n%s\n", filename, chunk.Content())
            case 0:
                continue
            }
        }
    }
}
