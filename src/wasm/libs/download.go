package libs

import (
	"encoding/json"
	"fmt"
	"syscall/js"
	"time"
	topexdownloader "topex-downloader"
)

type (
	Data struct {
		Lon float64 `json:"lon"`
		Lat float64 `json:"lat"`
		Val float64 `json:"val"`
	}
	StreamPresenter struct {
		TableDom   string
		ProgresBar string
		LogText    string
		IsError    bool
	}
)

func RenderRow(lat, long, top, ga *float64) string {
	gaStr := `<td></td>`
	topStr := gaStr
	if ga != nil {
		gaStr = fmt.Sprintf(`<td>%f</td>`, *ga)
	}
	if top != nil {
		topStr = fmt.Sprintf(`<td>%f</td>`, *top)
	}
	return fmt.Sprintf(`
		<tr>
			<td>%f</td>
			<td>%f</td>
			%s
			%s
		</tr>
	`, *lat, *long, topStr, gaStr)
}

func handleStreamError(percent float64, err error) {
	now := time.Now().UTC().Format("2006/01/02 15:04:05")
	msg := StreamPresenter{
		ProgresBar: topexdownloader.ProgressBar(percent),
		IsError:    true,
		LogText:    fmt.Sprintf("%s Error: %s", now, err.Error()),
	}
	js.Global().Call("ReceiveData", msg)
}

func StreamBatch() {
	js.Global().Set("StreamBatch", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		north := args[0].Float()
		south := args[1].Float()
		east := args[2].Float()
		west := args[3].Float()
		mag := args[4].Float()
		batchSize := args[5].Int()
		bound := topexdownloader.Payload{
			North: north,
			South: south,
			East:  east,
			West:  west,
			Mag:   mag,
		}

		gapTime := 250 * time.Millisecond

		chunk := bound.Chunk(1)
		stream := make(chan topexdownloader.Queue, len(chunk))
		go topexdownloader.Fetch(batchSize, gapTime, stream, chunk)

		var boundGrav topexdownloader.Payload
		var chunkGrav []topexdownloader.Payload
		var streamGrav chan topexdownloader.Queue

		switch mag {
		case 1:
			boundGrav = bound
			boundGrav.Mag = 1
			chunkGrav = boundGrav.Chunk(1)
			streamGrav = make(chan topexdownloader.Queue, len(chunkGrav))
			buffGrav := make(chan topexdownloader.Queue)
			go topexdownloader.Fetch(batchSize, gapTime, streamGrav, chunkGrav)
			go func() {
				for v := range streamGrav {
					buffGrav <- v
				}
				close(buffGrav)
			}()
			for v := range stream {
				now := time.Now().UTC().Format("2006/01/02 15:04:05")
				tops := make([]Data, 0)
				if v.Status == 1 {
					err := json.Unmarshal([]byte(v.Data), &tops)
					if err != nil {
						handleStreamError(v.Percent, err)
					}
				} else if v.Status == 0 {
					handleStreamError(v.Percent, v.Err)
				}
				grav, opened := <-buffGrav
				if opened {
					msg := StreamPresenter{
						LogText: fmt.Sprintf("%s writing with gravity anomaly now", now),
					}
					js.Global().Call("ReceiveData", msg)
					gravs := make([]Data, 0)
					if grav.Status == 1 {
						err := json.Unmarshal([]byte(grav.Data), &gravs)
						if err != nil {
							handleStreamError(v.Percent, err)
						}
					} else if grav.Status == 0 {
						handleStreamError(v.Percent, grav.Err)
					}
					if sameLen := len(tops) == len(gravs); !sameLen {
						for _, val := range tops {
							msg := StreamPresenter{
								LogText:    fmt.Sprintf("%s writing topography", now),
								ProgresBar: topexdownloader.ProgressBar(v.Percent),
								TableDom:   RenderRow(&val.Lat, &val.Lon, &val.Val, nil),
							}
							js.Global().Call("ReceiveData", msg)
						}
						for _, val := range gravs {
							msg := StreamPresenter{
								LogText:    fmt.Sprintf("%s writing gravity anomaly", now),
								ProgresBar: topexdownloader.ProgressBar(v.Percent),
								TableDom:   RenderRow(&val.Lat, &val.Lon, nil, &val.Val),
							}
							js.Global().Call("ReceiveData", msg)
						}
					} else if sameLen {
						for i, vk := range tops {
							msg := StreamPresenter{
								ProgresBar: topexdownloader.ProgressBar(v.Percent),
								LogText:    fmt.Sprintf("%s writing topography and gravity", now),
								TableDom:   RenderRow(&vk.Lat, &vk.Lon, &vk.Val, &gravs[i].Val),
							}
							js.Global().Call("ReceiveData", msg)
						}
					}
				} else if !opened {
					msg := StreamPresenter{
						LogText: fmt.Sprintf("%s gravity is done. Writing topography only", now),
					}
					js.Global().Call("ReceiveData", msg)
					for _, val := range tops {
						msg := StreamPresenter{
							LogText:    fmt.Sprintf("%s writing topography", now),
							ProgresBar: topexdownloader.ProgressBar(float64(v.Status)),
							TableDom:   RenderRow(&val.Lat, &val.Lon, &val.Val, nil),
						}
						js.Global().Call("ReceiveData", msg)
					}
				}
			}
		default:
			for v := range stream {
				now := time.Now().UTC().Format("2006/01/02 15:04:05")
				tops := make([]Data, 0)
				if v.Status == 1 {
					err := json.Unmarshal([]byte(v.Data), &tops)
					if err != nil {
						handleStreamError(v.Percent, err)
						continue
					}
				} else if v.Status == 0 {
					err := fmt.Errorf("%s Error: %v", now, v.Err)
					handleStreamError(v.Percent, err)
					continue
				}
				for _, val := range tops {
					msg := StreamPresenter{
						LogText:    fmt.Sprintf("%s writing topography", now),
						ProgresBar: topexdownloader.ProgressBar(v.Percent),
						TableDom:   RenderRow(&val.Lat, &val.Lon, &val.Val, nil),
					}
					js.Global().Call("ReceiveData", msg)
				}
			}
		}
		return nil
	}))
}
