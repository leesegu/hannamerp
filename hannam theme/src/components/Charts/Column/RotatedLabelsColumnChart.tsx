
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const RotatedLabelsColumnChart: React.FC = () => {
  // Chart
  // State for dynamically loaded Chart component
  const [ChartComponent, setChartComponent] =
    useState<React.ComponentType<any> | null>(null);

  // Dynamically import react-apexcharts
  useEffect(() => {
    import("react-apexcharts").then((module) => {
      setChartComponent(() => module.default);
    });
  }, []);

  const series = [
    {
      name: "Servings",
      data: [44, 55, 41, 67, 22, 43, 21, 33, 45, 31, 87, 65, 35],
    },
  ];

  const options: ApexOptions = {
    chart: {
      toolbar: {
        show: true,
      },
    },
    annotations: {
      points: [
        {
          x: "Bananas",
          seriesIndex: 0,
          label: {
            borderColor: "#605DFF",
            offsetY: 0,
            style: {
              fontSize: "14px",
              color: "#ffffff",
              background: "#605DFF",
            },
            text: "Bananas are good",
          },
        },
      ],
    },
    plotOptions: {
      bar: {
        columnWidth: "50%",
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      width: 2,
    },
    grid: {
      show: true,
      borderColor: "#ECEEF2",
    },
    xaxis: {
      axisBorder: {
        show: false,
        color: "#ECEEF2",
      },
      axisTicks: {
        show: false,
        color: "#ECEEF2",
      },
      labels: {
        rotate: -45,
        show: true,
        style: {
          colors: "#64748B",
          fontSize: "13px",
        },
      },
      categories: [
        "Apples",
        "Oranges",
        "Strawberries",
        "Pineapples",
        "Mangoes",
        "Bananas",
        "Blackberries",
        "Pears",
        "Watermelons",
        "Cherries",
        "Pomegranates",
        "Tangerines",
        "Papayas",
      ],
      tickPlacement: "on",
    },
    yaxis: {
      title: {
        text: "Servings",
        style: {
          color: "#3A4252",
          fontSize: "14px",
          fontWeight: 500,
        },
      },
      labels: {
        show: true,
        style: {
          colors: "#64748B",
          fontSize: "12px",
        },
      },
      axisBorder: {
        show: false,
        color: "#ECEEF2",
      },
      axisTicks: {
        show: false,
        color: "#ECEEF2",
      },
    },
    fill: {
      type: "gradient",
      gradient: {
        shade: "light",
        type: "horizontal",
        shadeIntensity: 0.25,
        gradientToColors: undefined,
        inverseColors: true,
        opacityFrom: 0.85,
        opacityTo: 0.85,
        // stops: [50, 0, 100]
      },
    },
  };

  return (
    <>
      <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md">
        <div className="trezo-card-header mb-[20px] md:mb-[25px] flex items-center justify-between">
          <div className="trezo-card-title">
            <h5 className="!mb-0">Rotated Labels Column Chart</h5>
          </div>
        </div>
        <div className="trezo-card-content">
          {ChartComponent ? (
            <ChartComponent
              options={options}
              series={series}
              type="bar"
              height={350}
              width={"100%"}
            />
          ) : (
            <div>Loading chart...</div>
          )}
        </div>
      </div>
    </>
  );
};

export default RotatedLabelsColumnChart;
