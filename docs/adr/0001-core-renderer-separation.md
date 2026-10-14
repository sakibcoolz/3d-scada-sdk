# ADR-0001: Semantic core isolated from rendering

Status: Accepted (architecture baseline)

## Context
SDK must be reusable outside React and allow alternate UI/render integrations.

## Decision
Domain types, scene validation and connection algorithms live in core without DOM, React or Three.js renderer dependencies. Rendering happens in adapters; React package provides optional bindings.

## Consequences
More adapters and dependency injection, but stable testable graph logic and reusable SDK. Current bootstrap has combined React rendering; split is scheduled, not complete.

## Verification
Dependency boundaries in CI, headless core tests and independent consumer example.
