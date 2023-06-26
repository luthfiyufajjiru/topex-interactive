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

func split(line string) (string, string, string) {
	line = strings.TrimLeft(line, " ")

	idx := [...]int{
		strings.Index(line, " "),
		strings.LastIndex(line, " "),
	}
	var (
		str1, str2, str3 string
	)

	ok1 := idx[0] > -1
	ok2 := idx[1] > -1

	if ok1 {
		str1 = line[:idx[0]]
	}

	if ok1 && ok2 {
		str2 = line[idx[0]+1 : idx[1]-3]
		str3 = line[idx[1]+1:]
	} else if ok1 && !ok2 {
		str2 = line[idx[0]+1:]
	}

	return str1, str2, str3
}

func Read(cancel context.CancelFunc, inp *bufio.Scanner, typeData string, ch chan<- RenderData) {
	defer cancel()
	if inp != nil {
		for inp.Scan() {
			line := inp.Text()
			if line == "" {
				continue
			}
			str1, str2, str3 := split(line)
			ch <- RenderData{str1, str2, str3, typeData}
		}
	}
}
