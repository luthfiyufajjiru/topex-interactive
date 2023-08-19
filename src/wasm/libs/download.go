package libs

import (
	"bufio"
	"log"
	"sync"
	"syscall/js"
	topexdownloader "topex-downloader"
)

type fetchSet struct {
	Buff *bufio.Scanner
	Err  error
}

func fetchAsync(wg *sync.WaitGroup, data topexdownloader.Payload, buff *bufio.Scanner) {
	defer wg.Done()
	_buff, _ := topexdownloader.Fetch(data)
	buff = _buff
}

func RenderTable() {
	jsLog := js.Global().Get("console").Get("log")
	js.Global().Set("renderTable", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		var (
			errString  string
			topo, grav *bufio.Scanner
		)

		north, south, east, west, withGrav := args[0], args[1], args[2], args[3], args[4]

		totalFetch := 1

		areas := []topexdownloader.Payload{
			{
				North: north.Float(),
				South: south.Float(),
				East:  east.Float(),
				West:  west.Float(),
				Mag:   1,
			},
		}

		if withGrav.Bool() {
			areas = append(areas, topexdownloader.Payload{
				North: north.Float(),
				South: south.Float(),
				East:  east.Float(),
				West:  west.Float(),
				Mag:   0.1,
			})
			totalFetch++
		}

		showErr := js.Global().Get("ShowError")

		if !showErr.Truthy() {
			msg := "function ShowError is not defined"
			log.Println(msg)
			return msg
		}

		setCsv := js.Global().Get("SetCSV")

		if !setCsv.Truthy() {
			msg := "function ShowError is not defined"
			log.Println(msg)
			return msg
		}

		var wg sync.WaitGroup

		wg.Add(totalFetch)

		go fetchAsync(&wg, areas[0], topo)
		if withGrav.Bool() {
			go fetchAsync(&wg, areas[1], grav)
		}
		wg.Wait()

		appendRow := js.Global().Get("AppendRow")

		if !appendRow.Truthy() {
			msg := "function AppendRow is not defined"
			log.Println(msg)
			return msg
		}

		var csv string
		res := make(chan string)

		go topexdownloader.RenderHTML(topo, grav, &csv, res)
		for {
			jsLog.Invoke("rendering data...")
			data, ok := <-res
			if !ok {
				break
			}
			appendRow.Invoke(data)
		}

		setCsv.Invoke(csv)
		return errString
	}))
}
