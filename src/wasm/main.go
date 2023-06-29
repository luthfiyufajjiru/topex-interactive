package main

func main() {
	c := make(chan struct{})
	defer func() {
		<-c
	}()
	<-c
}
