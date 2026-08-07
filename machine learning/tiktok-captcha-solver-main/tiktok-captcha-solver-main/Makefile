.PHONY: test
test:
	@uv run pytest -s

.PHONY: lint
lint:
	@uv run pyright
	@uv run ruff check .
