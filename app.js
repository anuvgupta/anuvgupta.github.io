var app = {
    // ui blocks
    block: Block("div", "app"),
    // button_color: '#7f7f7f',
    // button_color: '#435470',
    button_color: "#6e6e6e",

    // dash api
    api: {
        url: `${window.location.protocol}//${"dash.anuv.me"}/api`,
        timeout: 3000,
        get_projects: (next) => {
            // $.ajax();
            if (next) next(result);
        },
    },

    // project filter
    limit_projects: (limit = null) => {
        var tiles = app.block.child("tiles").children();
        if (limit == "featured") {
            // for (var t in tiles) {
            //     if (
            //         app.pinned_repos.includes(tiles[t].key("repo")) ||
            //         app.pinned_projects.includes(t)
            //     ) {
            //         tiles[t].css("display", "block");
            //     } else tiles[t].css("display", "none");
            // }
        } else {
            for (var t in tiles) {
                if (tiles[t].type == "project-tile") {
                    tiles[t].css("display", "block");
                }
            }
        }
    },

    // dynamic content
    content: {
        author: "Anuv Gupta",
        intro: {
            title: "Anuv",
            subtitle: "Projects",
            description: {
                text: "Hi! I like to build stuff. I keep some projects here. Transcending into an AI...   🌱",
                html: "Hi! I like to build stuff.<br/>I keep some projects here.<br/><br/><i>Transcending into an AI...</i>&nbsp;&nbsp;&nbsp;🌱",
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
        menubar: {
            default: "featured",
            items: ["all", "featured"],
        },
        tiles: {
            projects: [],
            applications: [],
        },
    },
    content_load: (next) => {
        var c = app.content;
        app.block.child("intro/title/main").html("").data(c.intro.title);
        app.block.child("intro/title/sub").html("").data(c.intro.subtitle);
        app.block.child("intro/desc/text").html(c.intro.description.html);
        app.block.child("intro/menu").html("");
        for (var m in c.intro.menu) {
            var item = c.intro.menu[m];
            app.block
                .child("intro/menu")
                .add(Block("menu-item", item.id).data(item));
        }
        for (var m in c.menubar.items) {
            var item = c.menubar.items[m];
            app.block
                .child("menubar")
                .add(Block("menubar-item", item).data(item));
        }
        app.tile_load((_) => {
            setTimeout((_) => {
                var tile_children = app.block.child("tiles").children();
                var tile_count = 0;
                for (var t_c in tile_children) {
                    if (tile_children[t_c].type() == "project-tile")
                        tile_count++;
                }
                if (tile_count <= 0) {
                    app.block
                        .child("tiles/updating")
                        .css("height", "80px")
                        .css("display", "table")
                        .child("loading_image")
                        .css("display", "none")
                        .sibling("text")
                        .css("display", "inline-block");
                    setTimeout((_) => {
                        app.block
                            .child("tiles/updating/text")
                            .css("opacity", "1");
                    }, 50);
                } else {
                    app.block.child("tiles/updating").css("display", "none");
                }
            }, app.api.timeout);
            setTimeout((_) => {
                app.block
                    .child(`menubar/${c.menubar.default}/block/button`)
                    .$()
                    .click();
                if (next) next();
            }, 5);
        });
    },
    tile_load: (next) => {
        var t = app.content.tiles;
        // app.block.child("tiles").html("");

        if (next) next();
    },

    // initialization
    main: () => {
        app.block.load(
            (_) => {
                app.block.fill(document.body);
                setTimeout((_) => {
                    app.content_load((_) => {
                        setTimeout((_) => {
                            app.block.on("open");
                        }, 10);
                        Block.queries();
                        setTimeout((_) => {
                            Block.queries();
                        }, 500);
                        if (util.mobile() || util.mobileAndTablet()) {
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
                        var previousScrollTop = util.cookie("scrolltop");
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
                        $(window).scroll(util.logScroll);
                    });
                }, 10);
            },
            "app",
            "jQuery"
        );
    },
};

// entry point
window.addEventListener("load", app.main);
