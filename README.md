# PIT

A Git wrapper that tracks changes in backend repositories.

## What is PIT?

`PIT` is born from the idea that modern web development cares more about changes in endpoints than files. 

## Why PIT?

Modern web practices often result in a simple endpoint change affecting multiple files. In such repositories, the scope of a change is better identified by the endpoints it touches rather than the files that changed.

## Where is PIT used?

### Tests
PIT can be used to better determine the scope of testing requirements after each server-level change. It eliminates the need for running irrelevant tests, allowing users to aim for better coverage of relevant ones.

### Access Control
Tracking at an endpoint level allows organizations to better control resource access. This enables more control to be placed in the hands of DevOps tools or junior developers, reducing friction and overhead required for safety. Endpoints that correspond to crucial functionality can be kept immutable while allowing unhindered feature development.

## Current Features

- Track endpoint changes in latest commit
- Support for NestJS
- Display endpoint-centric changes

## Planned Features

- Support for comparing any two Git refs (commits/branches/tags)
- Support for major JavaScript frameworks
- Support for staged/working tree changes
- CI/CD integration

## Installation

```bash
npm install -g pit
```

## Usage

```bash
pit
```

## Requirements

- Node.js >=14
- Git repository
- NestJS project (for current version)

## License

MIT
