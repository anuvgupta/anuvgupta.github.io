var app = {
    // ui blocks
    block: Block("div", "app"),
    // button_color: '#7f7f7f',
    // button_color: '#435470',
    button_color: "#6e6e6e",
    tile_sort_newest_first: true,

    // dash api
    api: {
        url: `${window.location.protocol}//${"dash.anuv.me"}`,
        timeout: 3000,
        get_projects: (next) => {
            // $.ajax();
            if (next) next(result);
        },
    },

    // project filter
    limit_projects: (limit = null) => {
        var tiles = app.block.child("tiles").children();
        var platforms = app.content.menubar.items[8].items;
        // console.log(limit);
        if (limit == "featured") {
            for (var t in tiles) {
                if (tiles[t].type() == "project-tile") {
                    if (tiles[t].key("featured") === true) {
                        tiles[t].css("display", "block");
                    } else tiles[t].css("display", "none");
                }
            }
        } else if (
            limit.toLowerCase() == "ai/ml" ||
            limit.toLowerCase() == "ai / ml"
        ) {
            for (var t in tiles) {
                if (tiles[t].type() == "project-tile") {
                    var tech_targets = [
                        "ONNX",
                        "Tensorflow",
                        "TFLite",
                        "PyTorch",
                        "Torch",
                        "SciKit-Learn",
                        "Scikit-learn",
                        "sklearn",
                        "Pruning",
                        "Quantization",
                    ];
                    var target_found = false;
                    for (var t_t in tech_targets) {
                        if (
                            tiles[t]
                                .key("tech")
                                .primary.includes(tech_targets[t_t]) ||
                            tiles[t]
                                .key("tech")
                                .secondary.includes(tech_targets[t_t])
                        ) {
                            target_found = true;
                            break;
                        }
                    }
                    if (target_found) {
                        tiles[t].css("display", "block");
                    } else tiles[t].css("display", "none");
                }
            }
        } else if (limit == "create") {
            for (var t in tiles) {
                if (tiles[t].type() == "project-tile") {
                    if (
                        tiles[t].key("purpose") == "Creativity" ||
                        // tiles[t].key("purpose") == "Essentials"
                    ) {
                        tiles[t].css("display", "block");
                    } else tiles[t].css("display", "none");
                }
            }
        } else if (limit == "life") {
            for (var t in tiles) {
                if (tiles[t].type() == "project-tile") {
                    if (
                        tiles[t].key("category") == "Quality of Life" ||
                        tiles[t].key("category") == "Social Media" ||
                        tiles[t].key("category") == "Health"
                    ) {
                        tiles[t].css("display", "block");
                    } else tiles[t].css("display", "none");
                }
            }
        } else if (limit == "music") {
            for (var t in tiles) {
                if (tiles[t].type() == "project-tile") {
                    if (tiles[t].key("category") == "Music") {
                        tiles[t].css("display", "block");
                    } else tiles[t].css("display", "none");
                }
            }
        } else if (limit == "learn") {
            for (var t in tiles) {
                if (tiles[t].type() == "project-tile") {
                    if (
                        tiles[t].key("category") == "Education" ||
                        tiles[t].key("category") == "Student Life" ||
                        tiles[t].key("purpose") == "School" ||
                        tiles[t].key("purpose") == "Work" ||
                        tiles[t].key("purpose") == "Career"
                    ) {
                        tiles[t].css("display", "block");
                    } else tiles[t].css("display", "none");
                }
            }
        } else if (limit == "games") {
            for (var t in tiles) {
                if (tiles[t].type() == "project-tile") {
                    if (
                        tiles[t].key("type") === "Game" ||
                        tiles[t].key("category") == "Gaming" ||
                        tiles[t].key("purpose") == "Entertainment"
                    ) {
                        tiles[t].css("display", "block");
                    } else tiles[t].css("display", "none");
                }
            }
        } else if (limit == "tools") {
            for (var t in tiles) {
                if (tiles[t].type() == "project-tile") {
                    if (
                        tiles[t].key("type") === "Script" || // comment out this line if the category grows too big
                        tiles[t].key("type") === "Library" || // also comment out this line if the category grows too big
                        tiles[t].key("category") == "Infrastructure" ||
                        tiles[t].key("purpose") == "Utility"
                    ) {
                        tiles[t].css("display", "block");
                    } else tiles[t].css("display", "none");
                }
            }
        } else if (platforms.includes(limit)) {
            for (var t in tiles) {
                if (tiles[t].type() == "project-tile") {
                    if (tiles[t].key("platform") === util.capitalize(limit)) {
                        tiles[t].css("display", "block");
                    } else tiles[t].css("display", "none");
                }
            }
        } else {
            // all
            for (var t in tiles) {
                if (tiles[t].type() == "project-tile") {
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
            items: [
                "all",
                "featured",
                "AI / ML",
                "music",
                "create",
                "learn",
                //"life",
                "games",
                "tools",
                // "_spacer_",
                {
                    value: "where",
                    items: ["embedded", "desktop", "mobile", "web"],
                },
            ],
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
            if (typeof item === "string")
                app.block
                    .child("menubar/content")
                    .add(Block("menubar-item", item).data(item));
            else if (typeof item === "object") {
                app.block
                    .child("menubar/content")
                    .add(
                        Block("menubar-item", item.value)
                            .data(item.value)
                            .data({ sub_items: item.items })
                    );
            }
        }
        app.tile_load((success) => {
            setTimeout((_) => {
                var tile_children = app.block.child("tiles").children();
                var tile_count = 0;
                for (var t_c in tile_children) {
                    if (tile_children[t_c].type() == "project-tile")
                        tile_count++;
                }
                if (!success || tile_count <= 0) {
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
                    .child(`menubar/content/${c.menubar.default}/block/button`)
                    .$()
                    .click();
                if (next) next();
            }, 5);
        });
    },
    tile_load: (next) => {
        var generate_blocks = (_) => {
            var projects = app.content.tiles.projects;
            if (projects.length > 0) {
                app.block.child("tiles").html("");
                for (var p in projects) {
                    app.block
                        .child("tiles")
                        .add(
                            Block("project-tile", `${projects[p].slug}`).data(
                                projects[p]
                            )
                        );
                }
            }
            if (next) next(true);
        };
        $.ajax({
            url: `${app.api.url}/api/projects`,
            method: "get",
            // data: { },
            success: (result, status, xhr) => {
                var newest_first = app.tile_sort_newest_first;
                result.projects.sort(util.ts_sort(newest_first));
                app.content.tiles.projects = result.projects;
                app.content.tiles.applications = result.applications;
                generate_blocks();
            },
            error: (xhr, status, error) => {
                if (
                    xhr.responseJSON &&
                    xhr.responseJSON.message &&
                    `${xhr.responseJSON.message}`.trim().length > 0
                ) {
                    console.error(`${xhr.responseJSON.message}`.trim());
                }
                console.log(error);
                if (next) next(false);
            },
        });
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
