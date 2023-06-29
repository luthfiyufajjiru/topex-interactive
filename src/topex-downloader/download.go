package topexdownloader

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/sirupsen/logrus"
)

type (
	Payload struct {
		North float64
		South float64
		West  float64
		East  float64
		Mag   float64
	}

	Point struct {
		Lat float64
		Lon float64
	}

	DataPoint struct {
		Point
		Val float64
	}
)

const (
	endpoint string = "https://topex.ucsd.edu/cgi-bin/get_data.cgi"
)

var (
	ErrWLE        = errors.New("value of West is larger than East (W > E)")
	ErrSLE        = errors.New("value of South is larger than North (S > N)")
	ErrInvalidMag = errors.New("value of Mag is invalid")
	ErrMaxBound   = errors.New("maximal bound area exceeded")
)

func Fetch(area Payload) (scanner *bufio.Scanner, err error) {
	if area.West > area.East {
		err = ErrWLE
		return
	} else if area.South > area.North {
		err = ErrSLE
		return
	} else if area.Mag != 0.1 && area.Mag != 1 {
		err = ErrInvalidMag
		return
	}

	if area.West < -360 || area.East > 360 || area.North > 80.738 || area.South < -80.738 {
		err = ErrMaxBound
		return
	}

	form := url.Values{}
	{
		form.Add("north", fmt.Sprintf("%f", area.North))
		form.Add("south", fmt.Sprintf("%f", area.South))
		form.Add("west", fmt.Sprintf("%f", area.West))
		form.Add("east", fmt.Sprintf("%f", area.East))
		form.Add("mag", fmt.Sprintf("%f", area.Mag))
	}

	resp, err := http.Post(endpoint, "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if ok := resp.StatusCode == http.StatusOK; err != nil && !ok {
		stat := "CLIENT ERR"
		if resp.StatusCode > 499 {
			stat = "TOPEX ERR"
		}
		logrus.WithError(err).Errorf("[client] - call [POST] %s - status code: %d(%s)", endpoint, http.StatusOK, stat)
		return
	} else if err != nil && ok {
		logrus.WithError(err).Errorf("[client] - call [POST] %s - status code: 200(OK). But got err", endpoint)
		return
	}
	scanner = bufio.NewScanner(resp.Body)
	return
}

type RenderData struct {
	Long, Lat, Val, Type string
}

func split(line string) (str1, str2, str3 string) {
	fields := strings.Fields(line)
	if ln := len(fields); ln == 3 {
		str1 = fields[0]
		str2 = fields[1]
		str3 = fields[2]
	}
	return str1, str2, str3
}

func trySend(ch chan<- RenderData, data RenderData) (success bool) {
	defer func() {
		r := recover()
		if r != nil {
			success = false
		}
	}()
	success = true
	ch <- data
	return
}

func Read(cancel context.CancelFunc, inp *bufio.Scanner, typeData string, ch chan<- RenderData, doneCh chan struct{}) {
	defer cancel()
	if inp != nil {
		for inp.Scan() {
			line := inp.Text()
			if line == "" {
				continue
			}
			str1, str2, str3 := split(line)
			ok := trySend(ch, RenderData{str1, str2, str3, typeData})
			if !ok {
				break
			}
		}
		doneCh <- struct{}{}
	}
}
