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
			Mag:   0.1,
		},
		{
			North: -10.1,
			South: -10.2,
			West:  360,
			East:  360.5,
			Mag:   1,
		},
	}

	wg := sync.WaitGroup{}
	wg.Add(2)

	scanner := [2]*bufio.Scanner{}

	inp := func(i int, wg *sync.WaitGroup, inp [2]*bufio.Scanner) {
		defer wg.Done()
		scanner, err := Fetch(area[i])
		if err != nil {
			logrus.WithError(err).Panic()
		}
		inp[i] = scanner
	}

	for i := 0; i < 2; i++ {
		go inp(i, &wg, scanner)
	}

	res := make(chan string)
	go RenderHTML(scanner[0], scanner[1], res)
	for {
		data, ok := <-res
		if !ok {
			break
		}
		fmt.Println(data)
	}
}
