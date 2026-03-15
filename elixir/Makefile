.PHONY: help all setup deps build fmt fmt-check lint test coverage ci dialyzer dashboard dashboard-watch dashboard-test

MIX ?= mix

help:
	@echo "Targets: setup, deps, fmt, fmt-check, lint, test, coverage, dialyzer, dashboard, dashboard-watch, dashboard-test, ci"

setup:
	$(MIX) setup

deps:
	$(MIX) deps.get

build:
	$(MIX) build

fmt:
	$(MIX) format

fmt-check:
	$(MIX) format --check-formatted

lint:
	$(MIX) lint

coverage:
	$(MIX) test --cover

test:
	$(MIX) test

dialyzer:
	$(MIX) deps.get
	$(MIX) dialyzer --format short

dashboard:
	./scripts/dashboard

dashboard-watch:
	./scripts/dashboard watch

dashboard-test:
	./scripts/dashboard test

ci:
	$(MAKE) setup
	$(MAKE) dashboard-test
	$(MAKE) build
	$(MAKE) fmt-check
	$(MAKE) lint
	$(MAKE) coverage
	$(MAKE) dialyzer

all: ci
