package main

import "wasm/libs"

func main() {
	c := make(chan struct{})
	defer func() {
		<-c
	}()
	libs.RenderTable()
}
