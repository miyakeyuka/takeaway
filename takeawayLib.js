"use strict";

var Takeaway = (function () {

	var _status = "";
	const OUTSEETS = ["yes", "no"];	// outseetタグ用

	return {
		status: () => { return _status },				// ステータスを返す
		get: function (keys, callback) {				// 情報（アイコンなど）を地図に追加
			console.log("Takeaway: get start...");
			_status = "get";
			var targets = [];
			if (keys == undefined || keys == "") {
				for (let key in Defaults) targets.push(key);
			} else {
				targets = keys;
			};
			if (map.getZoom() < MinZoomLevel) {
				console.log("MinZoomLevel...");
				Takeaway.update();
				_status = "";
				callback();
			} else {
				OvPassCnt.get(targets).then(geojson => {
					targets.forEach(key => { Layer_Data[key].geojson = geojson[key] });
					Takeaway.update();
					console.log("Takeaway: get end.");
					_status = "";
					callback();
				}).catch((jqXHR, statusText, errorThrown) => {
					console.log("Takeaway: Error. " + statusText);
				});
			}
		},

		// Update Takeout Map Icon
		update: function (targetkey) {
			let ZoomLevel = map.getZoom();
			if (targetkey == "" || typeof (targetkey) == "undefined") {		// no targetkey then update all layer
				for (let key in Defaults) {
					Marker.all_delete(key);
					if (Defaults[key].zoom <= ZoomLevel) Marker.set(key);
				}
			} else {
				Marker.all_delete(targetkey);
				if (Defaults[targetkey].zoom <= ZoomLevel) Marker.set(targetkey);
			}
		},

		view: function (tags) {
			_status = "view";
			DataList.select(tags.id);

			$("#osmid").html(tags.id);
			$("#name").html(tags.name == null ? "" : tags.name);
			$("#category").html(Takeaway.get_catname(tags));

			let openhour = tags.opening_hours == null ? "" : tags.opening_hours;
			RegexPTN.forEach(val => { openhour = openhour.replace(val[0], val[1]) });
			$("#opening_hours").html(openhour);

			let delname = tags.delivery == null ? "" : Categorys.delivery[tags.delivery];
			$("#delivery").html(delname);

			let outseet = OUTSEETS.indexOf(tags.outdoor_seating) < 0 ? "" : tags.outdoor_seating;
			$("#outdoor_seating").html(outseet);
			$("#outdoor_seating").attr("glot-model", "outdoor_seating_" + outseet);

			$("#phone").attr('href', tags.phone == null ? "" : "tel:" + tags.phone);
			$("#phone_view").html(tags.phone == null ? "" : tags.phone);

			$("#url").attr('href', tags.website == null ? "" : tags.website);
			$("#url_view").html(tags.website == null ? "" : tags.website);

			$("#description").html(tags.description == null ? "" : tags.description);

			glot.render();
			$('#PoiView_Modal').modal({ backdrop: 'static', keyboard: true });
			$('#PoiView_Modal').one('hidePrevented.bs.modal', function (e) {
				_status = "";
				$('#PoiView_Modal').modal('hide');
			});
		},

		openmap: osmid => {
			let latlng = Marker.get(osmid);
			let zoom = map.getZoom();
			window.open('https://www.google.com/maps/@' + latlng.lat + ',' + latlng.lng + ',' + zoom + 'z');
		},

		// get Category Name from Categorys(Global Variable)
		get_catname: function (tags) {
			let catname = "";
			var key1 = tags.amenity == undefined ? "shop" : "amenity";
			var key2 = tags[key1] == undefined ? "" : tags[key1];
			if (key2 !== "") {	 					// known tags
				catname = Categorys[key1][key2];
				if (catname == undefined) catname = "";
			}
			return catname;
		},

		// 2点間の距離を計算(参考: https://qiita.com/chiyoyo/items/b10bd3864f3ce5c56291)
		calc_between: function (ll1, ll2) {
			let pi = Math.PI, r = 6378137.0; 	// πと赤道半径
			let radLat1 = ll1.lat * (pi / 180);	// 緯度１
			let radLon1 = ll1.lng * (pi / 180);	// 経度１
			let radLat2 = ll2.lat * (pi / 180);	// 緯度２
			let radLon2 = ll2.lng * (pi / 180);	// 経度２
			let averageLat = (radLat1 - radLat2) / 2;
			let averageLon = (radLon1 - radLon2) / 2;
			return r * 2 * Math.asin(Math.sqrt(Math.pow(Math.sin(averageLat), 2) + Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(averageLon), 2)));
		}
	}
})();

// OverPass Server Control(Width easy cache)
var OvPassCnt = (function () {

	var Cache = {};																// geojson cache area
	var LLc = { "NW": { "lat": 0, "lng": 0 }, "SE": { "lat": 0, "lng": 0 } };	// latlng cache area

	return {
		get: function (targets) {
			return new Promise((resolve, reject) => {
				let ZoomLevel = map.getZoom();
				let LayerCounts = Object.keys(Defaults).length;
				if (LL.NW.lat < LLc.NW.lat && LL.NW.lng > LLc.NW.lng &&
					LL.SE.lat > LLc.SE.lat && LL.NW.lat < LLc.NW.lat) {
					// Within Cache range
					console.log("OvPassCnt: Cache Hit.");
					let RetCache = {};
					targets.forEach(key => { RetCache[key] = Cache[key] });
					resolve(RetCache);

				} else {
					// Not With Cache range
					DisplayStatus.progress(0);
					Cache = {};	// Cache Clear
					let magni = (ZoomLevel - MinZoomLevel) < 1 ? 0.25 : (ZoomLevel - MinZoomLevel) / 2;
					let offset_lat = (LL.NW.lat - LL.SE.lat) * magni;
					let offset_lng = (LL.SE.lng - LL.NW.lng) * magni;
					let SE_lat = LL.SE.lat - offset_lat;
					let SE_lng = LL.SE.lng + offset_lng;
					let NW_lat = LL.NW.lat + offset_lat;
					let NW_lng = LL.NW.lng - offset_lng;
					let maparea = '(' + SE_lat + ',' + NW_lng + ',' + NW_lat + ',' + SE_lng + ');';
					LLc = { "SE": { "lat": SE_lat, "lng": SE_lng }, "NW": { "lat": NW_lat, "lng": NW_lng } };	// Save now LL(Cache area)

					let jqXHRs = [], Progress = 0;
					targets.forEach(key => {
						let query = "";
						for (let ovpass in OverPass[key]) { query += OverPass[key][ovpass] + maparea; }
						let url = OvServer + '?data=[out:json][timeout:30];(' + query + ');out body;>;out skel qt;';
						// console.log("GET: " + url);
						jqXHRs.push($.get(url, () => { DisplayStatus.progress(Math.ceil(((++Progress + 1) * 100) / LayerCounts)) }));
					});
					$.when.apply($, jqXHRs).done(function () {
						let i = 0;
						targets.forEach(key => {
							let arg = arguments[0][1] == undefined ? arguments[1] : arguments[i][1];
							if (arg !== "success") { alert(OvGetError); reject() };
							let osmxml = arguments[i++][0]
							let geojson = osmtogeojson(osmxml, { flatProperties: true });
							geojson.features.forEach(function (val) { delete val.id; }); // delete Unnecessary osmid
							geojson = geojson.features.filter(val => {		// 非対応の店舗はキャッシュに載せない
								if (Takeaway.get_catname(val.properties) !== "") return val;
							});
							Cache[key] = { "features": geojson };
						});
						console.log("OvPassCnt: Cache Update");
						DisplayStatus.progress(0);
						resolve(Cache);
					}).fail(function (jqXHR, statusText, errorThrown) {
						console.log(statusText);
						reject(jqXHR, statusText, errorThrown);
					});
				};
			});
		}
	};
})();

// make Marker
var Marker = (function () {
	const PointUp = { radius: 8, color: '#000080', fillColor: '#0000A0', Opacity: 0.1, fillOpacity: 0.1 };
	var latlngs = {};

	return {
		get: osmid => { return latlngs[osmid] },
		set: function (key) {
			let geojson = Layer_Data[key].geojson;
			let markers = [];
			if (geojson !== undefined) {
				geojson.features.forEach(function (node) {
					let tags = node.properties;
					let icon = L.divIcon({ className: 'icon', html: '<img class="icon" src="' + Defaults[key].icon + '">' });
					if (node.geometry.type == "Polygon") {
						latlngs[tags.id] = { "lat": node.geometry.coordinates[0][0][1], "lng": node.geometry.coordinates[0][0][0] };
					} else {
						latlngs[tags.id] = { "lat": node.geometry.coordinates[1], "lng": node.geometry.coordinates[0] };
					}
					markers.push(L.marker(new L.LatLng(latlngs[tags.id].lat, latlngs[tags.id].lng), { icon: icon, draggable: false }));
					markers[markers.length - 1].addTo(map).on('click', e => Takeaway.view(e.target.takeaway_tags));
					markers[markers.length - 1].takeaway_tags = tags;
				});
				Layer_Data[key].markers = markers;
			}
		},

		all_delete: function (key) {	// all delete
			if (Layer_Data[key].markers !== undefined) {
				Layer_Data[key].markers.forEach(marker => marker.remove(map));
				Layer_Data[key].markers = undefined;
			}
		},

		list: function (targets) {
			let datas = [];
			targets.forEach(key => {
				if (Layer_Data[key].markers !== undefined) {
					Layer_Data[key].markers.forEach(marker => {
						let tags = marker.takeaway_tags;
						let name = tags.name == undefined ? "-" : tags.name;
						let category = Takeaway.get_catname(tags);
						let between = Math.round(Takeaway.calc_between(latlngs[tags.id], map.getCenter()));
						datas.push({ "osmid": tags.id, "name": name, "category": category, "between": between });
					})
				};
			});
			datas.sort((a, b) => {
				if (a.between > b.between) {
					return 1;
				} else {
					return -1;
				}
			})
			return datas;
		},

		center: function (osmid) {
			map.panTo(latlngs[osmid], { animate: true, easeLinearity: 0.1, duration: 0.5 });
			let circle = L.circle(latlngs[osmid], PointUp).addTo(map);
			setTimeout(() => map.removeLayer(circle), 2000);
		}
	}
})();

// PoiDatalist管理
var DataList = (function () {
	var table, _status = "", _lock = false;

	return {
		status: () => { return _status },		// statusを返す
		table: () => { return table },			// tableを返す
		lock: mode => { _lock = mode },			// DataListをロック(true) or 解除(false)とする
		view: function (targets) {				// PoiDataのリスト表示
			if (table !== undefined) table.destroy();
			let result = Marker.list(targets);
			table = $('#tableid').DataTable({
				"autoWidth": true,
				"columns": [{ title: "名前", data: "name", "width": "40%" }, { title: "種類", data: "category", "width": "30%" }, { title: "距離", data: "between", "width": "20%" },],
				"columnDefs": [{ targets: 2, render: $.fn.dataTable.render.number(',', '.', 0, '', 'm') }],
				"data": result,
				"processing": true,
				"filter": true,
				"destroy": true,
				"deferRender": true,
				"dom": 't',
				"language": DatatablesLang,
				"order": [2, 'asc'],
				"ordering": false,
				"orderClasses": false,
				"paging": true,
				"processing": false,
				"pageLength": 100000,
				"select": 'single',
				"scrollCollapse": true,
				"scrollY": ($("#dataid").height() - 27) + "px"
			});
			let osmid = table.row(0).data() == undefined ? undefined : table.row(0).data().osmid;
			if (osmid !== undefined) DataList.select(osmid);	// osmidがあれば1行目を選択

			table.on('select', function (e, dt, type, indexes) {
				if (_lock) {
					table.row(indexes).deselect();
				} else if (_status == "") {
					var data = table.row(indexes).data();
					table.off('select');
					Marker.center(data.osmid);	// do something with the ID of the selected items
				}
			});
		},

		select: function (osmid) {	// アイコンをクリックした時にデータを選択
			_status = "select";
			table.rows().deselect();
			let datas = table.data(), index = 0;
			for (let i in datas) {
				if (datas[i].osmid == osmid) {
					index = i;
					break;
				};
			};
			if (index >= 0) {
				table.row(index).select();
				table.row(index).node().scrollIntoView(true);
			}
			_status = "";
		},
		filter: KEYWORD => { table.search(KEYWORD).draw() }		// キーワード検索
	}
})();

// Display Status(progress&message)
var DisplayStatus = (function () {
	return {
		progress: percent => {
			percent = percent == 0 ? 1 : percent;
			$('#Progress_Bar').css('width', parseInt(percent) + "%");
		},
		morezoom: message => {
			if (!$("#morezoom").length) {
				let morezoom = L.control({ position: "topleft" });
				morezoom.onAdd = function (map) {
					this.ele = L.DomUtil.create('div', "morezoom");
					this.ele.id = "morezoom";
					return this.ele;
				};
				morezoom.addTo(map);
			};
			if (message !== "") {
				$("#morezoom").html("<h1>" + message + "</h1>");
			} else {
				$("#morezoom").html("");
			};
		}
	}
})();

