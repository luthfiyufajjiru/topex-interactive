const go = new Go();

const wasm = await WebAssembly.instantiateStreaming(fetch('./scripts/vendor/wasm/main.wasm'), go.importObject).then((result) => {
    let inst = result.instance;
    go.run(inst);
    return {renderTable}
})

export default wasm