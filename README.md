# pit

A git-wrapper that tracks changes in backend repositories.

## What is pit?

`pit` is born from the idea that modern web development cares more about changes in endpoints as opposed to files. 

## Why pit?

Modern web practices make it so that a simple change to one endpoint most likely results changes to multiple files. The scope of a change in such repositories is better identified by the endpoints it touched than the files that changed.

## Where is pit used?

### Tests
Pit can be used to better decide which the scope of testing requirement after each change at a server level. It can eliminate the need for running tests that are irrelavant to the change, allowing users to aim for better coverage of relevant ones.

### Access-control
Tracking at an endpoint level allows organisations to better control resource access. This can allow for more control to be placed in the hands of devOps tools or junior develops reducing the friction, overhead required for safety. Endpoints which correspond to crutial fucntionality can be kept immutable while allowing un-hindered feature developement.

## Current Features

- Track endpoint changes in latest commit
- Support for NestJS
- Display endpoint-centric changes

## Planned Features

- Support for comparing any two Git refs (commits/branches/tags)
- Support for major JavaScript frameworks
- Support for staged/working tree changes
- CI/CD integration

## Installation (Coming Soon)

```bash
brew install -g pit 
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
