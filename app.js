var app = {
    block: Block("div", "app"),
    logScroll: (e, scrolltop) => {
        if (Block.is.unset(scrolltop)) scrolltop = $(window).scrollTop();
        var percentage = 100 * (scrolltop / app.block.$().height());
        app.cookie("scrolltop", percentage);
    },
    mobile: (_) => {
        var check = false;
        ((a) => {
            if (
                /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(
                    a
                ) ||
                /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(
                    a.substr(0, 4)
                )
            )
                check = true;
        })(navigator.userAgent || navigator.vendor || window.opera);
        return check;
    }, // https://stackoverflow.com/questions/11381673/detecting-a-mobile-browser
    mobileAndTablet: (_) => {
        var check = false;
        ((a) => {
            if (
                /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(
                    a
                ) ||
                /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(
                    a.substr(0, 4)
                )
            )
                check = true;
        })(navigator.userAgent || navigator.vendor || window.opera);
        return check;
    }, // https://stackoverflow.com/questions/11381673/detecting-a-mobile-browser
    cookie: (id, val, date) => {
        if (Block.is.unset(val))
            document.cookie.split("; ").forEach((cookie) => {
                if (cookie.substring(0, id.length) == id)
                    val = cookie.substring(id.length + 1);
            });
        else
            document.cookie =
                id +
                "=" +
                val +
                (Block.is.set(date) ? "; expires=" + date : "");
        return Block.is.unset(val) ? null : val;
    },
    loadImage: (src, callback) => {
        var tempDiv = $("<div/>");
        tempDiv.append("<img/>");
        tempDiv
            .imagesLoaded()
            .done((i) => {
                console.log('image "' + src + '" loaded');
                callback();
                tempDiv.remove();
            })
            .fail((_) => {
                console.log('image "' + src + '" failed to load');
                tempDiv.remove();
            });
        tempDiv.children("img").attr("src", src);
    },
    // button_color: '#7f7f7f',
    // button_color: '#435470',
    button_color: "#6e6e6e",
    auth_token: "4cd058dd109cdba6443314ae61896db2ea8174c3",
    graphQL_q1: `{\n user(login: "anuvgupta") {\n pinnedItems(first: 9, types: [REPOSITORY, GIST]) {\n totalCount edges {\n node {\n ... on Repository {\n name }\n }\n }\n }\n }\n }`,
    graphQL_q2: `{\n repositoryOwner(login: "anuvgupta") {\n ... on ProfileOwner {\n pinnedItemsRemaining itemShowcase {\n items(first: 9) {\n totalCount edges {\n node {\n ... on Repository {\n name }\n }\n }\n }\n hasPinnedItems }\n }\n }\n }`,
    pinned_repos: [],
    pinned_projects: [
        "led-lights",
        "rubbr",
        "blockjs",
        "lancerhacks",
        "p2p",
        "pocketjs",
    ],
    limit_projects: (limit = null) => {
        var tiles = app.block.child("tiles").children();
        if (limit == "featured") {
            for (var t in tiles) {
                if (
                    app.pinned_repos.includes(tiles[t].key("repo")) ||
                    app.pinned_projects.includes(t)
                ) {
                    tiles[t].css("display", "block");
                } else tiles[t].css("display", "none");
            }
        } else {
            for (var t in tiles) {
                tiles[t].css("display", "block");
            }
        }
    },
    content: {
        intro: {
            title: "Anuv",
            subtitle: "Projects",
            description: {
                text: "Hi! I like to build stuff. I keep some projects here. Transcending into an AI...   🌱"
                html: "Hi! I like to build stuff. I keep some projects here.<br/><br/><i>Transcending into an AI...</i>&nbsp;&nbsp;&nbsp;🌱",
            },
            menu: [
                {
                    id: "github",
                    title: "GitHub",
                    link: "https://github.com/anuvgupta",
                    altTitle: "GitHub",
                },
                {
                    id: "home",
                    title: "Website",
                    link: "http://anuv.me",
                    altTitle: "Website",
                },
                {
                    id: "resume",
                    title: "Resume",
                    link: "https://drive.google.com/file/d/1wbzIdibrkTb-Ce0jtqNpWZAbTbPiRYwe/view?usp=sharing",
                },
            ],
        },
    },
    content_load: (next) => {
        var c = app.content;
        app.block.child("intro/title/main").html("").data(c.intro.title);
        app.block.child("intro/title/sub").html("").data(c.intro.subtitle);
        app.block.child("intro/desc/text").html(c.intro.description);
        app.block.child("intro/menu").html("");
        for (var m in c.intro.menu) {
            var item = c.intro.menu[m];
            app.block
                .child("intro/menu")
                .add(Block("menu-item", item.id).data(item));
        }
        if (next) next();
    },
};
window.addEventListener("load", () => {
    var _continue = (_) => {
        app.block.load(
            (_) => {
                app.block.fill(document.body);
                setTimeout((_) => {
                    app.content_load((_) => {
                        setTimeout((_) => {
                            app.block
                                .child("menubar/featured/block/button")
                                .$()
                                .click();
                        }, 5);
                        setTimeout((_) => {
                            app.block.on("open");
                        }, 10);
                        Block.queries();
                        setTimeout((_) => {
                            Block.queries();
                        }, 500);
                        if (app.mobile() || app.mobileAndTablet()) {
                            Block.queries("off");
                            $(window).on("orientationchange", (_) => {
                                setTimeout((_) => {
                                    Block.queries();
                                }, 250);
                                setTimeout((_) => {
                                    Block.queries();
                                }, 500);
                                Block.queries();
                            });
                        }
                        var previousScrollTop = app.cookie("scrolltop");
                        if (previousScrollTop != null) {
                            $("html, body")
                                .stop()
                                .animate(
                                    {
                                        scrollTop:
                                            (parseFloat(previousScrollTop) /
                                                100) *
                                            app.block.$().height(),
                                    },
                                    0,
                                    "swing"
                                );
                        }
                        $(window).scroll(app.logScroll);
                    });
                }, 10);
            },
            "app",
            "jQuery"
        );
    };
    $.ajax({
        url: "https://tokens.anuv.me/anuvgupta.github.io",
        method: "get",
        dataType: "json",
        success: (data, status, xhr) => {
            if (xhr.status == 200) {
                app.auth_token = data.token;
                $.ajax({
                    url: "https://api.github.com/graphql",
                    method: "post",
                    headers: {
                        Authorization: `Bearer ${app.auth_token}`,
                    },
                    data: JSON.stringify({
                        query: app.graphQL_q1,
                    }),
                    dataType: "json",
                    success: (data, status, xhr) => {
                        if (xhr.status == 200) {
                            var edges = data.data.user.pinnedItems.edges;
                            for (var n in edges) {
                                app.pinned_repos.push(edges[n].node.name);
                            }
                            setTimeout(_continue, 10);
                        } else {
                            console.log(status, data, xhr);
                            _continue();
                        }
                    },
                    error: (xhr, status, error) => {
                        console.log(status, error, xhr);
                        _continue();
                    },
                });
            } else {
                console.log(status, data, xhr);
                _continue();
            }
        },
        error: (xhr, status, error) => {
            console.log(status, error, xhr);
            _continue();
        },
    });
});
