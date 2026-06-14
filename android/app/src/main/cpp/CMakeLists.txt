cmake_minimum_required(VERSION 3.18.1)
project(edgevision)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Shared, platform-agnostic C++ core (also compiled into the iOS target).
# Located at the repo root so Android and iOS share one source of truth.
set(SHARED_CPP_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../cpp)

# ---------------------------------------------------------------------------
# OpenCV
# ---------------------------------------------------------------------------
# Point OpenCV_DIR at the unpacked OpenCV Android SDK's CMake config.
# It is configured from android/app/build.gradle via -DOpenCV_DIR=...
# See README "Setup" for how to obtain the SDK.
find_package(OpenCV REQUIRED)
include_directories(${OpenCV_INCLUDE_DIRS} ${SHARED_CPP_DIR})

# ---------------------------------------------------------------------------
# Native library loaded by the app (System.loadLibrary("edgevision"))
# ---------------------------------------------------------------------------
add_library(
        edgevision
        SHARED
        native-lib.cpp
        ${SHARED_CPP_DIR}/ImageProcessor.cpp)

find_library(log-lib log)

target_link_libraries(
        edgevision
        ${OpenCV_LIBS}
        ${log-lib})
