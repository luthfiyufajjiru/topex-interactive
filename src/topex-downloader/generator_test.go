package topexdownloader

import (
	"bufio"
	"fmt"
	"sync"
	"testing"

	"github.com/sirupsen/logrus"
)

func TestRenderHTML(t *testing.T) {
	area := [...]Payload{
		{
			North: -10.1,
			South: -10.2,
			West:  360,
			East:  360.5,
			Mag:   1,
		},
		{
			North: -10.1,
			South: -10.2,
			West:  360,
			East:  360.5,
			Mag:   0.1,
		},
		{
			North: -10.1,
			South: -10.2,
			West:  359.5,
			East:  360,
			Mag:   1,
		},
		{
			North: -10.1,
			South: -10.2,
			West:  359.5,
			East:  360,
			Mag:   0.1,
		},
	}

	errExpect := [...]error{ErrMaxBound, ErrMaxBound, nil, nil}

	wg := sync.WaitGroup{}
	wg.Add(4)

	scanner := [4]*bufio.Scanner{}

	inp := func(i int, wg *sync.WaitGroup) {
		defer wg.Done()
		_scanner, err := Fetch(area[i])
		if err != errExpect[i] {
			logrus.WithError(err).Panic("not expected error")
		}
		scanner[i] = _scanner
	}

	for i := 0; i < 4; i++ {
		go inp(i, &wg)
	}

	wg.Wait()

	res := make(chan string)
	csv := ""
	go RenderHTML(scanner[2], scanner[3], &csv, res)
	for {
		data, ok := <-res
		if !ok {
			break
		}
		fmt.Println(data)
	}
	// t.Log(csv)
}
