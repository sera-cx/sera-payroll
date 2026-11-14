.PHONY: build test fmt fmt-check clean deploy-sepolia
build:
	forge build
test:
	forge test -vv
fmt:
	forge fmt
fmt-check:
	forge fmt --check
clean:
	forge clean
deploy-sepolia:
	forge script script/Deploy.s.sol:Deploy --rpc-url sepolia --broadcast --verify -vvvv
