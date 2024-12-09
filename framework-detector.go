package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// FrameworkType represents the detected Node.js framework
type FrameworkType int

const (
	Unknown FrameworkType = iota
	Express
	NestJS
	Fastify
	Koa
	Hapi
	Sails
	Meteor
	Loopback
	Adonis
	Feathers
)

var ErrFrameworkNotFound = errors.New("unable to determine framework type")

type PackageJSON struct {
	Dependencies    map[string]string `json:"dependencies"`
	DevDependencies map[string]string `json:"devDependencies"`
}

// DetectFramework determines the Node.js framework used in the project
func DetectFramework(absPath string) (string, FrameworkType, error) {
	// Read package.json
	packageJSONPath := filepath.Join(absPath, "package.json")
	packageData, err := os.ReadFile(packageJSONPath)
	if err != nil {
		return "", Unknown, err
	}

	var pkg PackageJSON
	if err := json.Unmarshal(packageData, &pkg); err != nil {
		return "", Unknown, err
	}

	// Helper function to check if a dependency exists
	hasDependency := func(name string) bool {
		_, inDeps := pkg.Dependencies[name]
		_, inDevDeps := pkg.DevDependencies[name]
		return inDeps || inDevDeps
	}

	// Check for NestJS (most specific first)
	if hasDependency("@nestjs/core") {
		mainPath := filepath.Join(absPath, "src", "main.ts")
		if _, err := os.Stat(mainPath); err == nil {
			return mainPath, NestJS, nil
		}
	}

	// Check for AdonisJS
	if hasDependency("@adonisjs/core") {
		mainPath := filepath.Join(absPath, "start", "app.ts")
		if _, err := os.Stat(mainPath); err == nil {
			return mainPath, Adonis, nil
		}
	}

	// Check for Loopback
	if hasDependency("@loopback/core") {
		mainPath := filepath.Join(absPath, "src", "index.ts")
		if _, err := os.Stat(mainPath); err == nil {
			return mainPath, Loopback, nil
		}
	}

	// Check for Meteor
	if _, err := os.Stat(filepath.Join(absPath, ".meteor")); err == nil {
		mainPath := filepath.Join(absPath, "client", "main.js")
		return mainPath, Meteor, nil
	}

	// Check for Sails
	if hasDependency("sails") {
		mainPath := filepath.Join(absPath, "app.js")
		if _, err := os.Stat(mainPath); err == nil {
			return mainPath, Sails, nil
		}
	}

	// Check for Feathers
	if hasDependency("@feathersjs/feathers") {
		mainPath := filepath.Join(absPath, "src", "app.js")
		if _, err := os.Stat(mainPath); err == nil {
			return mainPath, Feathers, nil
		}
	}

	// Check for Hapi
	if hasDependency("@hapi/hapi") {
		mainPath := filepath.Join(absPath, "server.js")
		if _, err := os.Stat(mainPath); err == nil {
			return mainPath, Hapi, nil
		}
	}

	// Check for Koa
	if hasDependency("koa") {
		mainPath := filepath.Join(absPath, "app.js")
		if _, err := os.Stat(mainPath); err == nil {
			return mainPath, Koa, nil
		}
	}

	// Check for Fastify
	if hasDependency("fastify") {
		possiblePaths := []string{
			filepath.Join(absPath, "app.js"),
			filepath.Join(absPath, "server.js"),
			filepath.Join(absPath, "index.js"),
		}

		for _, path := range possiblePaths {
			if _, err := os.Stat(path); err == nil {
				return path, Fastify, nil
			}
		}
	}

	// Check for Express (fallback)
	if hasDependency("express") {
		possiblePaths := []string{
			filepath.Join(absPath, "app.js"),
			filepath.Join(absPath, "server.js"),
			filepath.Join(absPath, "index.js"),
		}

		for _, path := range possiblePaths {
			if _, err := os.Stat(path); err == nil {
				return path, Express, nil
			}
		}
	}

	return "", Unknown, ErrFrameworkNotFound
}

func (f FrameworkType) String() string {
	return [...]string{
		"Unknown",
		"Express",
		"NestJS",
		"Fastify",
		"Koa",
		"Hapi",
		"Sails",
		"Meteor",
		"Loopback",
		"Adonis",
		"Feathers",
	}[f]
}
// func main() {
// 	mainPath, framework, err := DetectFramework("/Users/prasshan/Desktop/Repos/yuzen-backend/")
// 	if err != nil {
// 	}
// 	fmt.Printf("Framework: %d,%s, Main file: %s\n", framework, framework, mainPath)
// }
