package topexdownloader

import (
	"bufio"
	"bytes"
	"context"
	"html/template"

	"github.com/sirupsen/logrus"
)

func RenderHTML(topo, grav *bufio.Scanner, res chan string) {
	ch := make(chan RenderData)
	defer close(res)
	defer close(ch)

	tpDone, gaDone := false, false

	ctxTp, cancelTp := context.WithCancel(context.Background())
	ctxGa, cancelGa := context.WithCancel(context.Background())

	go Read(cancelGa, grav, "gravity", ch)
	go Read(cancelTp, topo, "topography", ch)

signal:
	for {
		select {
		case <-ctxTp.Done():
			tpDone = true
			if gaDone {
				break signal
			}
		case <-ctxGa.Done():
			gaDone = true
			if tpDone {
				break signal
			}
		case data := <-ch:
			if tpDone && gaDone {
				break signal
			}

			var wr bytes.Buffer
			templ, err := template.New("row").Parse(`
			<tr class="{{.Type}}">
				<td class="long">{{.Long}}</td>
				<td class="lat">{{.Lat}}</td>
				<td class="val">{{.Val}}</td>
			</tr>
			`)
			if err != nil {
				logrus.WithError(err).Panic("[client] - error when parsing template")
			}

			err = templ.Execute(&wr, data)
			if err != nil {
				logrus.WithError(err).Error("[client] - error executing template")
			} else if err == nil {
				res <- wr.String()
			}
		default:
			if tpDone && gaDone {
				break signal
			}
		}
	}
}
