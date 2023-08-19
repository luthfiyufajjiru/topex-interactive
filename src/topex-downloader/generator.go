package topexdownloader

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"html/template"
	"strings"

	"github.com/sirupsen/logrus"
)

func RenderHTML(topo, grav *bufio.Scanner, csv *string, res chan string) {
	ch := make(chan RenderData)
	sb := strings.Builder{}

	sb.WriteString("lat,long,val,type")
	defer close(res)

	tpDone, gaDone := false, false

	ctxTp, cancelTp := context.WithCancel(context.Background())
	ctxGa, cancelGa := context.WithCancel(context.Background())
	doneCh := make(chan struct{})

	go Read(cancelGa, grav, "gravity", ch, doneCh)
	go Read(cancelTp, topo, "topography", ch, doneCh)
	go func() {
		<-doneCh
		<-doneCh
		close(ch)
	}()

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
			sb.WriteString(fmt.Sprintf("\n%s,%s,%s,%s", data.Lat, data.Long, data.Val, data.Type))

			var wr bytes.Buffer

			templ, err := template.New("row").Parse(`
			<tr class="align-middle text-center {{.Type}}">
				<td class="long">{{.Long}}</td>
				<td class="lat">{{.Lat}}</td>
				<td class="val">{{.Val}}</td>
				<td class="type">{{.Type}}</td>
			</tr>
			`)

			if err != nil {
				logrus.WithError(err).Panic("[client] - error when parsing template")
			}

			err = templ.Execute(&wr, data)
			if err != nil {
				logrus.WithError(err).Error("[client] - error executing template")
				break signal
			} else if err == nil {
				res <- wr.String()
			}
		default:
			if tpDone && gaDone {
				break signal
			}
		}
	}
	*csv = sb.String()
}
